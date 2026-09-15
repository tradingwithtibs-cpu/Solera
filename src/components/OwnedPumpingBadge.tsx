"use client";

import { usePortfolio } from "@/hooks/use-portfolio";
import { isPumping } from "@/lib/portfolio";
import type { TickerSymbol } from "@/lib/types";
import { PumpingBadge } from "./PumpingBadge";

/**
 * Shows the "Pumping" badge only when the signed-in user actually holds
 * this ticker — a personal "your position is heating up" signal, not a
 * general market-discovery indicator. A ticker being up 15%+ that the user
 * doesn't hold shows nothing here, regardless of whose row it's rendered
 * in (an investor's profile, Markets, wherever) — ownership always checks
 * against the signed-in user's own portfolio.
 */
export function OwnedPumpingBadge({ ticker }: { ticker: TickerSymbol }) {
  const { holdings, isLoaded } = usePortfolio();

  if (!isLoaded) return null;
  const owns = holdings.some((h) => h.ticker === ticker);
  if (!owns || !isPumping(ticker)) return null;

  return <PumpingBadge />;
}
