"use client";

import { useSyncExternalStore } from "react";
import { getEffectiveHistory, getLivePrices, isLiveHistory, subscribeLivePrices } from "@/lib/live-prices";
import { trailingChangePct } from "@/lib/portfolio";
import { PriceChart } from "./PriceChart";
import { PerformanceBadge } from "./PerformanceBadge";
import type { TickerSymbol } from "@/lib/types";

/**
 * The asset page's chart and trailing-change badge, as one client island:
 * both read the same real 7-day series (see app/api/price-history) so the
 * number under the price and the line beneath it can never disagree.
 */
export function AssetPriceChart({ ticker, color }: { ticker: TickerSymbol; color: string }) {
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  const live = isLiveHistory(ticker);
  const history = getEffectiveHistory(ticker);
  if (history.length < 2) {
    // Catalog tokens before their history arrives (or if the source is
    // rate-limited): say so rather than draw a placeholder.
    return (
      <div className="mx-5 mt-3 rounded-3xl border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">
        7-day chart loading…
      </div>
    );
  }
  return (
    <>
      <PerformanceBadge value={trailingChangePct(ticker)} />
      <div className="mx-5 mt-3 rounded-3xl border border-neutral-100 p-4">
        <PriceChart history={history} color={color} />
        <p className="mt-2 text-center text-xs text-neutral-400">
          {live ? "Last 7 days · Solana DEX price" : "Placeholder series · live chart loading"}
        </p>
      </div>
    </>
  );
}
