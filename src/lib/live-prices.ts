import { TICKERS } from "./mock-data";
import type { TickerSymbol } from "./types";

/**
 * Real, live-fetched prices — currently AAPLx and AMZNx, sourced from
 * Finnhub (see the design conversation this came out of; Pyth was tried
 * first, but real equity coverage there needs a $2,500+/month plan). Every
 * other ticker has no entry here and always falls through to its simulated
 * price in mock-data.ts, which already promises "swapping in real data is
 * meant to need no changes anywhere else" — this module is that seam, kept
 * separate from mock-data.ts itself so the mock file can stay purely
 * static and hand-written.
 */
let livePrices: Partial<Record<TickerSymbol, number>> = {};
const listeners = new Set<() => void>();

export function setLivePrice(ticker: TickerSymbol, price: number) {
  livePrices = { ...livePrices, [ticker]: price };
  listeners.forEach((listener) => listener());
}

export function subscribeLivePrices(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLivePrices() {
  return livePrices;
}

/**
 * The price to actually use anywhere in the app: live if we have one for
 * this ticker, simulated otherwise. Defensive against an invalid ticker
 * (e.g. a bad route param) on purpose — callers that need this before their
 * own "does this ticker exist" check (React hooks can't run after an early
 * return) get 0 back instead of a crash.
 */
export function getEffectivePrice(ticker: TickerSymbol): number {
  return livePrices[ticker] ?? TICKERS[ticker]?.price ?? 0;
}

/** Whether `ticker` currently has a real, live price behind it — for labeling in the UI. */
export function isLivePriced(ticker: TickerSymbol): boolean {
  return livePrices[ticker] !== undefined;
}
