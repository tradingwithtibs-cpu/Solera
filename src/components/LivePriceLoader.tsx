"use client";

import { useEffect } from "react";
import { setLivePrice } from "@/lib/live-prices";
import type { TickerSymbol } from "@/lib/types";

const POLL_INTERVAL_MS = 15_000;

/**
 * Mounted once near the root (see layout.tsx). Polls our own /api/live-prices
 * route — never Finnhub directly from the browser, so the API key never
 * leaves the server — and feeds whatever it gets into the shared live-price
 * store.
 * Fails silently: if the key isn't configured yet, or the fetch fails for
 * any reason, every ticker just keeps using its simulated price, exactly as
 * it does before this component exists. Renders nothing.
 */
export function LivePriceLoader() {
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/live-prices");
        if (!res.ok) return;
        const data = (await res.json()) as { prices?: Record<string, number> };
        if (cancelled || !data.prices) return;
        for (const [ticker, price] of Object.entries(data.prices)) {
          if (Number.isFinite(price)) setLivePrice(ticker as TickerSymbol, price);
        }
      } catch {
        // Ignore — affected tickers just keep their simulated price.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return null;
}
