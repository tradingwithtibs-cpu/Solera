"use client";

import { useEffect } from "react";
import { isFeatured } from "@/lib/catalog";
import { setHistory, setLivePrice } from "@/lib/live-prices";

const POLL_MS = 5_000;

/**
 * Fast polling for one non-featured ticker while it's on screen (asset
 * page, trade screen). Featured tickers are already polled globally, so
 * this is a no-op for them. Also pulls the ticker's 30-day history once.
 */
export function useLivePriceFor(symbol: string | undefined) {
  useEffect(() => {
    if (!symbol || isFeatured(symbol)) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/live-prices?tickers=${encodeURIComponent(symbol!)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { prices?: Record<string, number> };
        const price = data.prices?.[symbol!];
        if (!cancelled && typeof price === "number" && price > 0) setLivePrice(symbol!, price);
      } catch {
        // Keep the last known price.
      }
    }
    async function history() {
      try {
        const res = await fetch(`/api/price-history?ticker=${encodeURIComponent(symbol!)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { history?: Record<string, number[]> };
        const closes = data.history?.[symbol!];
        if (!cancelled && Array.isArray(closes) && closes.length >= 2) setHistory(symbol!, closes);
      } catch {
        // No chart for this one yet.
      }
    }

    poll();
    history();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol]);
}
