"use client";

import { usePortfolio } from "./use-portfolio";
import { useLivePortfolio } from "./use-live-portfolio";
import { useTradeMode } from "./use-trade-mode";
import type { TickerSymbol, TradeSide } from "@/lib/types";

/**
 * The portfolio every screen should read: the wallet's real holdings, SOL
 * and USDC in live mode, the localStorage practice portfolio otherwise.
 * Same shape either way, so Portfolio, Activity, the trade screen, and the
 * position badges don't need to know which one they're looking at beyond
 * the `mode` flag for copy.
 *
 * `cashBalance` is always dollars: practice cash, or SOL at the live price
 * plus USDC. The live-only `solBalance`/`usdcBalance` are what the trade
 * screen uses to cap an order in the currency it's actually paid in.
 */
export function useActivePortfolio() {
  const { mode, isLive } = useTradeMode();
  const practice = usePortfolio();
  const live = useLivePortfolio();

  const recordTrade = (params: {
    ticker: TickerSymbol;
    side: TradeSide;
    quantity: number;
    pricePerShare: number;
    totalValue: number;
    txId: string;
    copiedFromInvestorId?: string;
  }) => (isLive ? live.recordTrade(params) : practice.recordTrade(params));

  return isLive
    ? {
        mode,
        cashBalance: live.cashBalance,
        solBalance: live.solBalance,
        usdcBalance: live.usdcBalance,
        solUsd: live.solUsd,
        holdings: live.holdings,
        transactions: live.transactions,
        isLoaded: live.isLoaded,
        recordTrade,
      }
    : {
        mode,
        cashBalance: practice.cashBalance,
        solBalance: 0,
        usdcBalance: 0,
        solUsd: live.solUsd,
        holdings: practice.holdings,
        transactions: practice.transactions,
        isLoaded: practice.isLoaded,
        recordTrade,
      };
}
