"use client";

import { useEffect } from "react";
import { hasRangeHistory, setRangeHistory, type HistoryWindow, type RangeKey } from "@/lib/live-prices";
import type { TickerSymbol } from "@/lib/types";

const inFlight = new Set<string>();

/**
 * Makes sure the store has the series for a chart range. 7d and 1M come
 * from the 30-day sweep every page already loads; 24h and 6M are fetched
 * once per ticker on first use and then cached by the route.
 */
export function useHistoryRange(tickers: readonly TickerSymbol[], window: HistoryWindow) {
  const key = tickers.join(",");
  useEffect(() => {
    if (window !== "24h" && window !== "180d") return;
    const range: RangeKey = window;
    let cancelled = false;
    for (const ticker of key ? key.split(",") : []) {
      if (hasRangeHistory(ticker, range)) continue;
      const id = `${ticker}:${range}`;
      if (inFlight.has(id)) continue;
      inFlight.add(id);
      fetch(`/api/price-history?ticker=${encodeURIComponent(ticker)}&range=${range}`)
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as { history?: Record<string, number[]> };
          const closes = data.history?.[ticker];
          if (!cancelled && Array.isArray(closes) && closes.length >= 2) setRangeHistory(ticker, range, closes);
        })
        .catch(() => {
          // The chart keeps saying it is loading; a later mount retries.
        })
        .finally(() => inFlight.delete(id));
    }
    return () => {
      cancelled = true;
    };
  }, [key, window]);
}
