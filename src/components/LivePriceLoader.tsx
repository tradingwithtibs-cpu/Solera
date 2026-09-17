"use client";

import { useEffect } from "react";
import { setLivePrice, setSolPrice, setUnderlyingQuote } from "@/lib/live-prices";
import type { TickerSymbol } from "@/lib/types";

/**
 * Hermes feeds tick sub-second; polling every few seconds keeps the UI
 * visibly live without pushing the server past Hermes' free rate limit
 * (the route also caches for 5s, so this is the effective floor).
 */
const POLL_INTERVAL_MS = 5_000;

interface LivePricesPayload {
  prices?: Record<string, number>;
  underlying?: Record<string, { price: number; publishTime: number; stale: boolean }>;
  solUsd?: number;
}

/**
 * Mounted once near the root (see layout.tsx). Polls our own /api/live-prices
 * route — never Pyth directly from the browser, so the API key never leaves
 * the server — and feeds whatever it gets into the shared live-price store.
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
        const data = (await res.json()) as LivePricesPayload;
        if (cancelled) return;
        for (const [ticker, price] of Object.entries(data.prices ?? {})) {
          if (Number.isFinite(price)) setLivePrice(ticker as TickerSymbol, price);
        }
        for (const [ticker, quote] of Object.entries(data.underlying ?? {})) {
          if (Number.isFinite(quote?.price)) setUnderlyingQuote(ticker as TickerSymbol, quote);
        }
        if (typeof data.solUsd === "number" && Number.isFinite(data.solUsd)) setSolPrice(data.solUsd);
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
