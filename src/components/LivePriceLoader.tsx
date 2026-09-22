"use client";

import { useEffect } from "react";
import { setChange24h, setFetchedAt, setHistory, setLivePrice, setSolPrice, setUnderlyingQuote } from "@/lib/live-prices";
import type { TickerSymbol } from "@/lib/types";

/**
 * Hermes feeds tick sub-second; polling every few seconds keeps the UI
 * visibly live without pushing the server past Hermes' free rate limit
 * (the route also caches for 5s, so this is the effective floor).
 */
const POLL_INTERVAL_MS = 5_000;
/**
 * 7-day charts barely move, and the route caches them for 15 minutes, so
 * this mostly returns cached data — polling every minute is what lets
 * tickers the server is still back-filling (see app/api/price-history)
 * show up soon after first load.
 */
const HISTORY_INTERVAL_MS = 60_000;

interface LivePricesPayload {
  prices?: Record<string, number>;
  underlying?: Record<string, { price: number; publishTime: number; stale: boolean }>;
  solUsd?: number;
  change24h?: Record<string, number>;
  fetchedAt?: number;
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
        for (const [ticker, pct] of Object.entries(data.change24h ?? {})) {
          if (Number.isFinite(pct)) setChange24h(ticker as TickerSymbol, pct);
        }
        setFetchedAt(typeof data.fetchedAt === "number" ? data.fetchedAt : Date.now());
      } catch {
        // Ignore — affected tickers just keep their simulated price.
      }
    }

    async function pollHistory() {
      try {
        const res = await fetch("/api/price-history");
        if (!res.ok) return;
        const data = (await res.json()) as { history?: Record<string, number[]> };
        if (cancelled) return;
        for (const [ticker, closes] of Object.entries(data.history ?? {})) {
          if (Array.isArray(closes) && closes.length >= 2) setHistory(ticker as TickerSymbol, closes);
        }
      } catch {
        // Ignore — charts keep their placeholder series.
      }
    }

    poll();
    pollHistory();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    const historyInterval = setInterval(pollHistory, HISTORY_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(historyInterval);
    };
  }, []);

  return null;
}
