"use client";

import { formatCurrency } from "@/lib/format";
import { getChange24h } from "@/lib/live-prices";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import { isFeatured } from "@/lib/catalog";
import type { TickerSymbol } from "@/lib/types";

/**
 * The headline price block of an asset: the live Solana price in mono,
 * Jupiter's 24h move beneath it, and where the number comes from. Real
 * figures only: before the first fetch the move reads "—".
 */
export function EffectivePriceDisplay({ ticker, className = "" }: { ticker: TickerSymbol; className?: string }) {
  const { price, isLive } = useEffectivePrice(ticker);
  const change = getChange24h(ticker);
  return (
    <div className={className}>
      <b>{isLive ? formatCurrency(price) : "—"}</b>
      {change !== undefined ? (
        <small className={change >= 0 ? "up" : "down"}>
          {change >= 0 ? "+" : ""}
          {change.toFixed(1)}% 24h
        </small>
      ) : (
        <small className="muted">— 24h</small>
      )}
      <span className="src">{isLive ? (isFeatured(ticker) ? "Live · Pyth" : "Live · Jupiter") : "waiting for Jupiter"}</span>
    </div>
  );
}
