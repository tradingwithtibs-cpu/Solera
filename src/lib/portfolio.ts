import { getEffectiveHistory, getEffectivePrice } from "./live-prices";
import type { HoldingPosition, Investor, TickerSymbol } from "./types";

export interface HoldingWithValue extends HoldingPosition {
  /** Current simulated market value of this position, in USD. */
  value: number;
  /** Share of the total holdings value this position represents, 0-100. */
  allocationPct: number;
  /** Unrealized gain/loss vs. `costBasis`, in %. Only set when `costBasis` is known. */
  gainPct?: number;
}

/**
 * Derives dollar values and allocation percentages from raw share counts,
 * sorted largest position first. Keeping this as a pure function (rather
 * than baking values into mock data) means prices only live in one place.
 */
export function computeHoldings(holdings: HoldingPosition[]): HoldingWithValue[] {
  const withValue = holdings.map((h) => {
    const price = getEffectivePrice(h.ticker);
    return {
      ...h,
      value: h.shares * price,
      gainPct: h.costBasis ? ((price - h.costBasis) / h.costBasis) * 100 : undefined,
    };
  });

  const total = withValue.reduce((sum, h) => sum + h.value, 0);

  return withValue
    .map((h) => ({ ...h, allocationPct: total > 0 ? (h.value / total) * 100 : 0 }))
    .sort((a, b) => b.allocationPct - a.allocationPct);
}

/**
 * Weighted unrealized return across a set of holdings, vs. their cost
 * basis — this is the real, computed replacement for what used to be a
 * hardcoded "all time" performance number. Holdings without a known cost
 * basis (shouldn't happen for the user's own portfolio) are excluded from
 * both sides of the ratio rather than treated as a 0% return.
 */
export function computePortfolioPerformance(holdings: HoldingWithValue[]): number {
  let costTotal = 0;
  let valueTotal = 0;

  for (const h of holdings) {
    if (h.costBasis === undefined) continue;
    costTotal += h.shares * h.costBasis;
    valueTotal += h.value;
  }

  return costTotal > 0 ? ((valueTotal - costTotal) / costTotal) * 100 : 0;
}

// A fixed (non-random) jitter pattern so the trailing chart looks like a
// real, wiggly price line rather than a straight ramp — deterministic so it
// doesn't visibly reshuffle on every unrelated re-render.
const JITTER_PATTERN = [0, 0.4, -0.2, 0.6, 0.1, -0.3, 0.5, 0.2, -0.4, 0.3, 0.6, -0.1, 0.4, 0.7, 0.2, -0.2, 0.5, 0.3, -0.1, 0];

/**
 * Fabricates a trailing performance series for a value that only has a
 * current total and an all-time % return — there's no real historical
 * portfolio-value data to chart (no backend). The series always ends
 * exactly at `currentValue`, so it stays consistent with whatever the
 * balance says after a trade.
 */
export function buildPortfolioHistory(currentValue: number, changePct: number, points = 20): number[] {
  const startValue = currentValue / (1 + changePct / 100);
  const totalChange = currentValue - startValue;
  const jitterScale = Math.abs(totalChange) * 0.08 + currentValue * 0.004;

  const series = Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    const base = startValue + totalChange * t;
    const jitter = JITTER_PATTERN[i % JITTER_PATTERN.length] * jitterScale;
    return Math.max(0, base + jitter);
  });

  series[series.length - 1] = currentValue;
  return series;
}

export interface TrendingTicker {
  ticker: TickerSymbol;
  /** Total dollar value held across every investor on the platform. */
  totalValue: number;
  /** How many of the mock investors hold any amount of this ticker. */
  holderCount: number;
}

/**
 * "Trending" for a platform with a fixed, curated universe of 3 tickers
 * doesn't mean price-momentum discovery (that's a memecoin pattern) — it
 * means "where is the community's money actually going", computed from
 * real (if mock) aggregate holdings data already in the app, largest
 * platform-wide position first.
 */
export function computeTrendingTickers(investors: Investor[]): TrendingTicker[] {
  const totals = new Map<TickerSymbol, TrendingTicker>();

  for (const investor of investors) {
    for (const holding of investor.holdings) {
      const entry = totals.get(holding.ticker) ?? { ticker: holding.ticker, totalValue: 0, holderCount: 0 };
      entry.totalValue += holding.shares * getEffectivePrice(holding.ticker);
      entry.holderCount += 1;
      totals.set(holding.ticker, entry);
    }
  }

  return [...totals.values()].sort((a, b) => b.totalValue - a.totalValue);
}

// Above this share of a portfolio, concentration starts costing score —
// intentionally lower/softer than the 50% "⚠ Concentrated" badge threshold
// in HoldingRow, so the score reacts before a position is flagged outright.
const SCORE_CONCENTRATION_THRESHOLD_PCT = 40;
const SCORE_CONCENTRATION_PENALTY_RATE = 0.8;

/**
 * A simple, transparent alternative to ranking purely on raw return: your
 * score is your performance, minus a penalty for any position beyond 40%
 * of your portfolio. Rewards prudent sizing instead of just "who YOLO'd
 * hardest" — every other social-trading leaderboard (this one's default
 * view included) only shows the latter.
 *
 * This raw value is unbounded and can go negative (e.g. a profitable but
 * heavily concentrated position can still net below zero) — that's fine
 * for sorting, but a bare signed number reads as "broken" to a consumer,
 * not "moderately concentrated". See `normalizeSoleraScore` below for
 * the bounded, display-facing version. Keep this raw function as the sort
 * key: it's monotonic with the normalized version, so ranking never
 * differs between the two.
 */
export function computeSoleraScore(holdings: HoldingWithValue[], performancePct: number): number {
  const maxAllocationPct = holdings.reduce((max, h) => Math.max(max, h.allocationPct), 0);
  const penalty = Math.max(0, maxAllocationPct - SCORE_CONCENTRATION_THRESHOLD_PCT) * SCORE_CONCENTRATION_PENALTY_RATE;
  return performancePct - penalty;
}

// Controls how quickly the normalized score spreads across the 0–100
// range as the raw score moves away from 0. Picked so that the raw scores
// actually produced by this app's mock data (roughly -50 to +50) land
// across most of the scale instead of clustering near the middle or
// clipping to the edges — e.g. raw 0 → 50, raw +20 → ~73, raw -24 → ~23.
const SCORE_NORMALIZATION_SCALE = 20;

/**
 * Maps the unbounded raw score to a 0–100 scale via a logistic curve, so
 * it always has a legible floor and ceiling — like a credit score or an
 * app rating — instead of an unbounded number that can go negative and
 * reads as "something broke" to a consumer. Monotonic with the raw score,
 * so it never changes the leaderboard's ranking, only how the number is
 * displayed.
 */
export function normalizeSoleraScore(rawScore: number): number {
  return 100 / (1 + Math.exp(-rawScore / SCORE_NORMALIZATION_SCALE));
}

/** A short, plain-English read on a normalized (0–100) Solera Score. */
export function describeSoleraScore(normalizedScore: number): string {
  if (normalizedScore >= 80) return "Strong";
  if (normalizedScore >= 60) return "Solid";
  if (normalizedScore >= 40) return "Fair";
  if (normalizedScore >= 20) return "Weak";
  return "Struggling";
}

/** A ticker is "pumping" once its trailing 7-day history is up at least this much. */
const PUMPING_THRESHOLD_PCT = 15;

/** Percent change across the ticker's trailing series (real 7-day closes when fetched). */
export function trailingChangePct(ticker: TickerSymbol): number {
  const history = getEffectiveHistory(ticker);
  if (history.length < 2 || history[0] <= 0) return 0;
  return ((history[history.length - 1] - history[0]) / history[0]) * 100;
}

/** @deprecated alias kept for older call sites — same as `trailingChangePct`. */
export const tickerChangePct = trailingChangePct;

/**
 * True whenever a ticker's own trailing price history — the same series
 * backing its chart — is up 15%+ over the last 7 days.
 */
export function isPumping(ticker: TickerSymbol): boolean {
  return trailingChangePct(ticker) >= PUMPING_THRESHOLD_PCT;
}
