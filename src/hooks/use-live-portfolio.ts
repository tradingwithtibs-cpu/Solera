"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getUltraBalances } from "@/lib/jupiter";
import { getLivePrices, getSolPrice, subscribeLivePrices } from "@/lib/live-prices";
import { USDC } from "@/lib/tokens";
import { symbolForMint } from "@/lib/catalog";
import { PRE_IPO_MINTS } from "@/lib/pre-ipo";
import { costBasisFromTrades } from "@/lib/live-ledger";
import { getStoredSession } from "./use-session";
import type { HoldingPosition, TickerSymbol, TradeSide, Transaction } from "@/lib/types";

const POLL_INTERVAL_MS = 15_000;
const STORAGE_KEY = "solera:live-trades";

/**
 * The connected wallet's real portfolio.
 *
 * Share counts come from the chain (via Jupiter's balances endpoint, which
 * understands Token-2022) so tokens bought anywhere show up, not just ones
 * bought here. Cost basis and the activity list come from live trades made
 * through Solera, kept in localStorage keyed by wallet: the chain knows
 * what you hold, not what you paid, and a token bought elsewhere simply
 * shows no return figure rather than a made-up one.
 */

// --- live trade ledger (per wallet, localStorage) ------------------------

type Ledger = Record<string, Transaction[]>;

function readLedger(): Ledger {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Ledger) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let ledger: Ledger = typeof window !== "undefined" ? readLedger() : {};
const ledgerListeners = new Set<() => void>();
const EMPTY: Transaction[] = [];

/** Appends a landed trade to a wallet's local ledger. Exported for trades that finish outside React (deeplink returns). */
export function recordLiveTrade(wallet: string, txn: Transaction) {
  ledger = { ...ledger, [wallet]: [txn, ...(ledger[wallet] ?? [])] };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger));
  } catch {
    // Ignore write failures.
  }
  ledgerListeners.forEach((l) => l());
  void publishLiveFill(wallet, txn);
}

/** Puts a landed trade on the public tape when the wallet is signed in; the server verifies it on-chain. */
async function publishLiveFill(wallet: string, txn: Transaction & { settledIn?: "SOL" | "USDC"; settledAmount?: number }) {
  const session = getStoredSession();
  if (!session || !txn.signature || (session.kind === "wallet" && session.wallet !== wallet)) return;
  try {
    await fetch("/api/fills", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({
        signature: txn.signature,
        ticker: txn.ticker,
        side: txn.side ?? "buy",
        quantity: txn.quantity,
        pricePerShare: txn.pricePerShare,
        totalValue: txn.totalValue,
        settledIn: txn.settledIn,
        settledAmount: txn.settledAmount,
        note: txn.note,
        wrongIf: txn.wrongIf,
        leg: txn.leg,
        via: txn.via ?? "ticket",
        planId: txn.planId,
        copiedFrom: txn.copiedFromInvestorId,
      }),
    });
  } catch {
    // The local ledger is the source of truth for this wallet; the tape can catch up later.
  }
}

// --- hook ---------------------------------------------------------------

export function useLivePortfolio() {
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58() ?? null;

  const allTrades = useSyncExternalStore(
    (l) => {
      ledgerListeners.add(l);
      return () => ledgerListeners.delete(l);
    },
    () => ledger,
    () => ledger,
  );
  const transactions = address ? (allTrades[address] ?? EMPTY) : EMPTY;

  const [balances, setBalances] = useState<{
    address: string;
    sol: number;
    usdc: number;
    shares: Partial<Record<TickerSymbol, number>>;
    /** Pre-IPO tokens held, by mint. */
    preIpo: Record<string, number>;
  } | null>(null);
  // SOL is valued in dollars at the live SOL/USD price, so re-render when it moves.
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  const solUsd = getSolPrice() ?? 0;

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const data = await getUltraBalances(address);
      const shares: Partial<Record<TickerSymbol, number>> = {};
      const preIpo: Record<string, number> = {};
      for (const [mint, entry] of Object.entries(data)) {
        if (!entry || entry.uiAmount <= 0) continue;
        const ticker = symbolForMint(mint);
        if (ticker) shares[ticker] = entry.uiAmount;
        else if (PRE_IPO_MINTS[mint]) preIpo[mint] = entry.uiAmount;
      }
      setBalances({
        address,
        sol: data.SOL?.uiAmount ?? 0,
        usdc: data[USDC.mint]?.uiAmount ?? 0,
        shares,
        preIpo,
      });
    } catch {
      // Keep whatever we had; the next poll will retry.
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    // Fetch-on-mount/change plus a slow poll; setState only ever runs after
    // the network round trip, never synchronously in this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // Polling only — no websocket subscription. The public mainnet RPC
    // rejects browser websockets ("ws error"), and a trade calls refresh()
    // directly anyway, so nothing is lost.
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [address, refresh]);

  const basis = costBasisFromTrades(transactions);
  const holdings: HoldingPosition[] =
    balances && balances.address === address
      ? (Object.entries(balances.shares) as [TickerSymbol, number][]).map(([ticker, shares]) => ({
          ticker,
          shares,
          costBasis: basis[ticker],
        }))
      : [];

  const record = useCallback(
    (params: {
      ticker: TickerSymbol;
      side: TradeSide;
      quantity: number;
      pricePerShare: number;
      totalValue: number;
      txId: string;
      copiedFromInvestorId?: string;
      note?: string;
      wrongIf?: string;
      leg?: "gap" | "mark";
      via?: "ticket" | "plan" | "agent" | "copy";
      planId?: string;
      settledIn?: "SOL" | "USDC";
      settledAmount?: number;
    }) => {
      if (!address) return;
      recordLiveTrade(address, {
        id: params.txId,
        ticker: params.ticker,
        side: params.side,
        quantity: params.quantity,
        pricePerShare: params.pricePerShare,
        totalValue: params.totalValue,
        timestamp: Date.now(),
        copiedFromInvestorId: params.copiedFromInvestorId,
        signature: params.txId,
        note: params.note,
        wrongIf: params.wrongIf,
        leg: params.leg,
        via: params.via,
        planId: params.planId,
        ...(params.settledIn ? { settledIn: params.settledIn, settledAmount: params.settledAmount } : {}),
      } as Transaction);
      refresh();
    },
    [address, refresh],
  );

  const current = balances && balances.address === address ? balances : null;
  const solBalance = current?.sol ?? 0;
  const usdcBalance = current?.usdc ?? 0;

  return {
    address,
    /** SOL (at the live price) plus USDC, in dollars: everything that could go into a stock. */
    cashBalance: solBalance * solUsd + usdcBalance,
    solBalance,
    usdcBalance,
    solUsd,
    holdings,
    /** Pre-IPO tokens in the wallet: mint → amount. Priced by the caller via /api/pre-ipo. */
    preIpoHoldings: current?.preIpo ?? {},
    transactions,
    isLoaded: !!current,
    recordTrade: record,
    refresh,
  };
}
