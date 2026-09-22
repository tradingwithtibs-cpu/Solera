"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePreIpo } from "@/hooks/use-pre-ipo";
import { useInvestors } from "@/hooks/use-investors";
import { computeTrendingTickers } from "@/lib/portfolio";
import { getLivePrices, getUnderlyingQuote, subscribeLivePrices } from "@/lib/live-prices";
import { XSTOCK_TOKENS } from "@/lib/tokens";
import type { TickerSymbol } from "@/lib/types";

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/**
 * The chip row under the top bar. Every chip is computed from live data
 * and simply absent until that data exists; nothing here is a placeholder.
 */
export function Strip() {
  const { tokens } = usePreIpo();
  const { investors, source } = useInvestors();
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);

  const widest = tokens.filter((t) => Number.isFinite(t.premiumPct)).sort((a, b) => Math.abs(b.premiumPct) - Math.abs(a.premiumPct))[0];
  const mostHeld = source === "chain" ? computeTrendingTickers(investors)[0] : undefined;
  const closed = (Object.keys(XSTOCK_TOKENS) as TickerSymbol[]).some((t) => getUnderlyingQuote(t)?.stale === true);

  const chips: React.ReactNode[] = [];
  if (widest) {
    chips.push(
      <Link key="gap" href="/pre-ipo" className="chip-l glass gap">
        <i>Widest gap</i>
        <b>{widest.symbol}</b>
        <em className={widest.premiumPct >= 0 ? "up" : "down"}>{pct(widest.premiumPct)}</em>
        <span>vs mark</span>
      </Link>,
    );
  }
  if (mostHeld) {
    chips.push(
      <Link key="held" href={`/asset/${mostHeld.ticker}`} className="chip-l glass live">
        <i>Most held</i>
        <b>{mostHeld.ticker}</b>
        <span>· {mostHeld.holderCount} wallets</span>
      </Link>,
    );
  }
  if (closed) {
    chips.push(
      <span key="closed" className="chip-l glass warn">
        <i>NYSE closed</i>
        <span>pricing vs the stock resumes at open</span>
      </span>,
    );
  }
  if (chips.length === 0) return null;
  return (
    <div className="strip">
      <div className="strip-track">{chips}</div>
    </div>
  );
}
