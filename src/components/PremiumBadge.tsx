"use client";

import { PYTH_FEEDS } from "@/lib/pyth-feeds";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import type { TickerSymbol } from "@/lib/types";

/**
 * How the xStock is trading relative to the real listed share, from Pyth's
 * underlying-equity feed. Three states:
 *
 * - Market open and both feeds live: "+0.12% vs AAPL" (green above, red
 *   below). This is the number a tokenized-stock trader actually cares about
 *   — it's the cost of on-chain access right now.
 * - Market closed: "NYSE closed · vs AAPL" — the token still trades, the
 *   stock doesn't, so a "premium" would only measure after-hours drift.
 * - No live data: renders nothing at all.
 *
 * `compact` drops the "vs AAPL" suffix for tight list rows.
 */
export function PremiumBadge({ ticker, compact = false }: { ticker: TickerSymbol; compact?: boolean }) {
  const { isLive, underlying, premiumPct } = useEffectivePrice(ticker);
  if (!isLive || !underlying) return null;
  const vs = PYTH_FEEDS[ticker].equitySymbol;

  if (underlying.stale || premiumPct === undefined) {
    return (
      <span className="text-[10px] font-medium text-neutral-400" title={`${vs} last regular-session price`}>
        {compact ? "NYSE closed" : `NYSE closed · ${vs} pricing resumes at open`}
      </span>
    );
  }

  const sign = premiumPct > 0 ? "+" : premiumPct < 0 ? "−" : "";
  const tone =
    Math.abs(premiumPct) < 0.05 ? "text-neutral-500" : premiumPct > 0 ? "text-amber-600" : "text-emerald-600";
  return (
    <span
      className={`text-[10px] font-medium tabular-nums ${tone}`}
      title={`${ticker} is trading ${Math.abs(premiumPct).toFixed(2)}% ${premiumPct >= 0 ? "above" : "below"} ${vs} on the exchange`}
    >
      {sign}
      {Math.abs(premiumPct).toFixed(2)}%{compact ? "" : ` vs ${vs}`}
    </span>
  );
}
