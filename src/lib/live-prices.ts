import { getTickerInfo } from "./catalog";
import { premiumPct } from "./pyth-feeds";
import type { TickerSymbol } from "./types";

/**
 * The client-side store for everything live — see app/api/live-prices and
 * app/api/price-history for the fetches. Layers:
 *
 * - `prices`: what each xStock token trades at on Solana right now (Jupiter),
 *   24/7. This is the tradeable price and what `getEffectivePrice` returns.
 * - `underlying`: the listed share's price from Pyth, regular session only.
 *   Never used as *the* price; it drives the premium/discount badge.
 * - `solUsd`: for sizing SOL-paid trades and valuing SOL balances.
 * - `history`: real 30-day closes per ticker for charts and trailing moves.
 *
 * Before the first successful fetch, every ticker falls through to the
 * placeholder numbers in mock-data.ts, which exist only so the UI has a
 * shape to render — this module is the seam where real data takes over.
 */
export interface UnderlyingQuote {
  price: number;
  publishTime: number;
  stale: boolean;
}

export interface LiveSnapshot {
  prices: Partial<Record<TickerSymbol, number>>;
  underlying: Partial<Record<TickerSymbol, UnderlyingQuote>>;
  /** SOL/USD — needed to size SOL-paid trades and value a wallet's SOL in dollars. */
  solUsd?: number;
  /** Real trailing 30-day closes per ticker (~4/day), oldest → newest (see app/api/price-history). */
  history: Partial<Record<TickerSymbol, number[]>>;
  /** Jupiter's 24h price change per ticker, in percent. */
  change24h: Partial<Record<TickerSymbol, number>>;
  /** Lazily fetched ranges beyond the 30-day series: 5-minute closes for 24h, daily closes for 180d. */
  ranges: Partial<Record<TickerSymbol, Partial<Record<RangeKey, number[]>>>>;
  /** Unix ms of the last successful price fetch; drives the footer's "refreshed" time. */
  fetchedAt?: number;
}

let snapshot: LiveSnapshot = { prices: {}, underlying: {}, history: {}, change24h: {}, ranges: {} };

/** Ranges the price-history route serves on demand. */
export type RangeKey = "24h" | "180d";

export function setRangeHistory(ticker: TickerSymbol, range: RangeKey, closes: number[]) {
  commit({ ...snapshot, ranges: { ...snapshot.ranges, [ticker]: { ...(snapshot.ranges[ticker] ?? {}), [range]: closes } } });
}

/** Whether a lazily fetched range is in the store. */
export function hasRangeHistory(ticker: TickerSymbol, range: RangeKey): boolean {
  return Array.isArray(snapshot.ranges[ticker]?.[range]);
}

export function setChange24h(ticker: TickerSymbol, pct: number) {
  commit({ ...snapshot, change24h: { ...snapshot.change24h, [ticker]: pct } });
}

/** Jupiter's 24h move for `ticker`, or undefined before the first fetch. */
export function getChange24h(ticker: TickerSymbol): number | undefined {
  return snapshot.change24h[ticker];
}

export function setFetchedAt(at: number) {
  commit({ ...snapshot, fetchedAt: at });
}

export function setSolPrice(solUsd: number) {
  commit({ ...snapshot, solUsd });
}

/** SOL/USD, or undefined before the first price fetch. */
export function getSolPrice(): number | undefined {
  return snapshot.solUsd;
}

export function setHistory(ticker: TickerSymbol, closes: number[]) {
  commit({ ...snapshot, history: { ...snapshot.history, [ticker]: closes } });
}

/**
 * The trailing price series to chart: the real 7-day DEX closes once
 * fetched, the hand-written placeholder series from mock-data.ts before
 * that (or if the history source is down). Same fallback contract as
 * `getEffectivePrice`.
 */
export type HistoryWindow = "24h" | "7d" | "30d" | "180d";

export function getEffectiveHistory(ticker: TickerSymbol, window: HistoryWindow = "7d"): number[] {
  // 24h and 180d exist only when fetched: never a placeholder for those.
  if (window === "24h" || window === "180d") return snapshot.ranges[ticker]?.[window] ?? [];
  const real = snapshot.history[ticker];
  if (!real) return getTickerInfo(ticker).history;
  // The route returns 30 days at a steady cadence; the last ~quarter is 7 days.
  return window === "30d" ? real : real.slice(-Math.max(2, Math.round(real.length * 7 / 30)));
}

/** Whether `ticker`'s chart for this window is drawn from real market data. */
export function isLiveHistory(ticker: TickerSymbol, window: HistoryWindow = "7d"): boolean {
  if (window === "24h" || window === "180d") return hasRangeHistory(ticker, window);
  return snapshot.history[ticker] !== undefined;
}
const listeners = new Set<() => void>();

function commit(next: LiveSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function setLivePrice(ticker: TickerSymbol, price: number) {
  commit({ ...snapshot, prices: { ...snapshot.prices, [ticker]: price } });
}

export function setUnderlyingQuote(ticker: TickerSymbol, quote: UnderlyingQuote) {
  commit({ ...snapshot, underlying: { ...snapshot.underlying, [ticker]: quote } });
}

export function subscribeLivePrices(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The current snapshot — a new object on every update, so it works directly
 * as a `useSyncExternalStore` snapshot. Read prices through
 * `getEffectivePrice` / `getUnderlyingQuote` rather than off this object.
 */
export function getLivePrices(): LiveSnapshot {
  return snapshot;
}

/**
 * The price to actually use anywhere in the app: live if we have one for
 * this ticker, simulated otherwise. Defensive against an invalid ticker
 * (e.g. a bad route param) on purpose — callers that need this before their
 * own "does this ticker exist" check (React hooks can't run after an early
 * return) get 0 back instead of a crash.
 */
export function getEffectivePrice(ticker: TickerSymbol): number {
  return snapshot.prices[ticker] ?? getTickerInfo(ticker).price;
}

/** Whether `ticker` currently has a real, live price behind it — for labeling in the UI. */
export function isLivePriced(ticker: TickerSymbol): boolean {
  return snapshot.prices[ticker] !== undefined;
}

/** The underlying listed share's latest print, if we have one. */
export function getUnderlyingQuote(ticker: TickerSymbol): UnderlyingQuote | undefined {
  return snapshot.underlying[ticker];
}

/**
 * How far the xStock is trading from its underlying share, in percent.
 * Only defined while both are live and the equity print is fresh — a stale
 * print (market closed) would make the "premium" mostly just after-hours
 * drift, which is a different thing to show.
 */
export function getPremiumPct(ticker: TickerSymbol): number | undefined {
  const underlying = snapshot.underlying[ticker];
  if (!underlying || underlying.stale) return undefined;
  return premiumPct(snapshot.prices[ticker], underlying.price);
}
