"use client";

import { useState, useSyncExternalStore } from "react";
import { getEffectiveHistory, getLivePrices, isLiveHistory, subscribeLivePrices, type HistoryWindow } from "@/lib/live-prices";
import { useHistoryRange } from "@/hooks/use-history-range";
import { trailingChangePct } from "@/lib/portfolio";
import { PriceChart } from "./PriceChart";
import { PerformanceBadge } from "./PerformanceBadge";
import { RangeSwitch, rangeCaption } from "./ui/RangeSwitch";
import type { TickerSymbol } from "@/lib/types";

/**
 * The asset chart with its range switch and trailing-change badge, as one
 * client island: the number and the line read the same real series (see
 * app/api/price-history), so they can never disagree. 24H and 6M are
 * fetched on first use; until then the chart says it is loading rather
 * than drawing a placeholder.
 */
export function AssetPriceChart({ ticker, color }: { ticker: TickerSymbol; color: string }) {
  const [range, setRange] = useState<HistoryWindow>("7d");
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  useHistoryRange([ticker], range);
  const live = isLiveHistory(ticker, range);
  const history = getEffectiveHistory(ticker, range);
  const change = history.length >= 2 ? ((history[history.length - 1] - history[0]) / history[0]) * 100 : trailingChangePct(ticker);

  return (
    <div className="mx-5 mt-3">
      <div className="flex items-center justify-between gap-3">
        {history.length >= 2 ? <PerformanceBadge value={change} /> : <span />}
        <RangeSwitch value={range} onChange={setRange} />
      </div>
      {history.length < 2 ? (
        <div className="mt-3 rounded-[var(--radius-panel)] border border-dashed border-line-strong p-4 text-center text-xs text-muted" aria-busy="true">
          {rangeCaption(range).split(" · ")[0]} chart loading…
        </div>
      ) : (
        <div className="mt-3 rounded-[var(--radius-panel)] border border-line p-4">
          <PriceChart history={history} color={color} />
          <p className="mt-2 text-center text-xs text-muted">{live ? `${rangeCaption(range)} · Solana DEX price` : "Placeholder series · live chart loading"}</p>
        </div>
      )}
    </div>
  );
}
