import { TICKERS } from "./mock-data";
import { premiumPct } from "./pyth-feeds";
import type { TickerSymbol } from "./types";

/**
 * Real, live prices from Pyth, for every ticker — see app/api/live-prices
 * for the fetch and lib/pyth-feeds.ts for which feeds. Two layers:
 *
 * - `prices`: the xStock token's own price (Crypto.AAPLX/USD etc.), 24/7.
 *   This is the tradeable price and what `getEffectivePrice` returns.
 * - `underlying`: the listed share's price (Equity.US.AAPL/USD etc.),
 *   regular session only. Never used as *the* price; it exists so the UI can
 *   show how far the token is trading from the real stock.
 *
 * Before the first successful fetch (or with no PYTH_API_KEY configured)
 * every ticker falls through to its simulated price in mock-data.ts, which
 * already promises "swapping in real data is meant to need no changes
 * anywhere else" — this module is that seam.
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
}

let snapshot: LiveSnapshot = { prices: {}, underlying: {} };

export function setSolPrice(solUsd: number) {
  commit({ ...snapshot, solUsd });
}

/** SOL/USD, or undefined before the first price fetch. */
export function getSolPrice(): number | undefined {
  return snapshot.solUsd;
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
  return snapshot.prices[ticker] ?? TICKERS[ticker]?.price ?? 0;
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
