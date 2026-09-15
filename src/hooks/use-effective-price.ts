"use client";

import { useSyncExternalStore } from "react";
import { getEffectivePrice, getLivePrices, isLivePriced, subscribeLivePrices } from "@/lib/live-prices";
import type { TickerSymbol } from "@/lib/types";

/**
 * The price to render for `ticker` right now, plus whether it's real. Every
 * component that needs a "current price" for display or math should go
 * through this (or `getEffectivePrice` directly, in non-component code)
 * instead of reading `TICKERS[ticker].price` — that's what makes today's
 * two real tickers (and any added later) take effect everywhere at once.
 */
export function useEffectivePrice(ticker: TickerSymbol) {
  // Subscribing to the whole live-price map, not just this ticker, is fine:
  // there are only ever a couple of live tickers, and re-rendering a
  // component whose own ticker didn't change costs nothing measurable here.
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  return { price: getEffectivePrice(ticker), isLive: isLivePriced(ticker) };
}
