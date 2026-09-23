"use client";

import { useSyncExternalStore } from "react";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { usePreIpo } from "@/hooks/use-pre-ipo";
import { getTickerInfo } from "@/lib/catalog";
import { getEffectivePrice, getLivePrices, subscribeLivePrices } from "@/lib/live-prices";
import { computeHoldings, computePortfolioPerformance, type HoldingWithValue } from "@/lib/portfolio";
import { COMPANIES, PRE_IPO_MINTS, type Issuer } from "@/lib/pre-ipo";
import type { TradeMode } from "@/lib/trade";
import type { HoldingPosition, Transaction } from "@/lib/types";

export interface EquityPosition {
  kind: "xstock";
  /** Notes key. */
  key: string;
  ticker: string;
  name: string;
  shares: number;
  price: number;
  value: number;
  costBasis?: number;
  gainPct?: number;
  allocationPct: number;
}

export interface PreIpoPosition {
  kind: "preipo";
  key: string;
  mint: string;
  symbol: string;
  name: string;
  issuer: Issuer;
  shares: number;
  /** Undefined until /api/pre-ipo has priced the mint. */
  price?: number;
  value: number;
  premiumPct?: number;
  markPrice?: number;
}

export type PositionView = EquityPosition | PreIpoPosition;

export interface PortfolioView {
  mode: TradeMode;
  isLive: boolean;
  isLoaded: boolean;
  cashBalance: number;
  rawHoldings: HoldingPosition[];
  /** Equity holdings with values and allocations, largest first. */
  valued: HoldingWithValue[];
  equity: EquityPosition[];
  preIpo: PreIpoPosition[];
  positions: PositionView[];
  holdingsValue: number;
  preIpoValue: number;
  invested: number;
  totalValue: number;
  /** Unrealized return across holdings with a cost basis. */
  performancePct: number;
  hasBasis: boolean;
  /** Live holdings bought elsewhere: no cost to compare, left out of the return figure. */
  withoutBasis: number;
  transactions: Transaction[];
}

/**
 * Everything the portfolio cards read, derived once from the active
 * ledger (practice or the wallet) at live prices. Pre-IPO tokens are
 * wallet-held only, priced by the shared pre-IPO store.
 */
export function usePortfolioView(): PortfolioView {
  const active = useActivePortfolio();
  const { tokens } = usePreIpo();
  // computeHoldings and getEffectivePrice read the live store; subscribing here re-renders on every tick.
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);

  const valued = computeHoldings(active.holdings);
  const equity: EquityPosition[] = valued.map((h) => ({
    kind: "xstock",
    key: h.ticker,
    ticker: h.ticker,
    name: getTickerInfo(h.ticker).name,
    shares: h.shares,
    price: getEffectivePrice(h.ticker),
    value: h.value,
    costBasis: h.costBasis,
    gainPct: h.gainPct,
    allocationPct: h.allocationPct,
  }));

  const preIpo: PreIpoPosition[] = Object.entries(active.preIpoHoldings)
    .map(([mint, shares]): PreIpoPosition | null => {
      const info = PRE_IPO_MINTS[mint];
      if (!info) return null;
      const quote = tokens.find((t) => t.mint === mint);
      return {
        kind: "preipo",
        key: mint,
        mint,
        symbol: info.symbol,
        name: COMPANIES[info.company].name,
        issuer: info.issuer,
        shares,
        price: quote?.tokenPrice,
        value: quote ? shares * quote.tokenPrice : 0,
        premiumPct: quote?.premiumPct,
        markPrice: quote?.markPrice,
      };
    })
    .filter((p): p is PreIpoPosition => p !== null)
    .sort((a, b) => b.value - a.value);

  const holdingsValue = valued.reduce((sum, h) => sum + h.value, 0);
  const preIpoValue = preIpo.reduce((sum, p) => sum + p.value, 0);
  const invested = holdingsValue + preIpoValue;
  const withBasis = valued.filter((h) => h.costBasis !== undefined);

  return {
    mode: active.mode,
    isLive: active.mode === "live",
    isLoaded: active.isLoaded,
    cashBalance: active.cashBalance,
    rawHoldings: active.holdings,
    valued,
    equity,
    preIpo,
    positions: [...equity, ...preIpo],
    holdingsValue,
    preIpoValue,
    invested,
    totalValue: invested + active.cashBalance,
    performancePct: computePortfolioPerformance(valued),
    hasBasis: withBasis.length > 0,
    withoutBasis: valued.length - withBasis.length,
    transactions: active.transactions,
  };
}
