"use client";

import { useSyncExternalStore } from "react";
import {
  getEffectivePrice,
  getLivePrices,
  getPremiumPct,
  getUnderlyingQuote,
  isLivePriced,
  subscribeLivePrices,
} from "@/lib/live-prices";
import type { TickerSymbol } from "@/lib/types";

/**
 * The price to render for `ticker` right now, plus whether it's real and how
 * it compares to the underlying share. Every component that needs a "current
 * price" for display or math should go through this (or `getEffectivePrice`
 * directly, in non-component code) instead of reading `TICKERS[ticker].price`
 * — that's what makes live Pyth prices take effect everywhere at once.
 */
export function useEffectivePrice(ticker: TickerSymbol) {
  // Subscribing to the whole snapshot, not just this ticker, is fine: there
  // are eight tickers, and re-rendering a component whose own ticker didn't
  // change costs nothing measurable here.
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  return {
    price: getEffectivePrice(ticker),
    isLive: isLivePriced(ticker),
    underlying: getUnderlyingQuote(ticker),
    premiumPct: getPremiumPct(ticker),
  };
}
