"use client";

import { useCallback, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { executeLiveSwap, settlementBaseUnits, settlementDollars } from "@/lib/trade";
import { SETTLEMENT, fromBaseUnits, type SettlementCurrency } from "@/lib/tokens";
import { isDeferredSigner } from "@/lib/deferred-signing";
import { COMPANIES, type PreIpoToken } from "@/lib/pre-ipo";
import type { Leg } from "@/lib/fills";
import { getStoredSession } from "./use-session";
import { useTradeMode } from "./use-trade-mode";

/** The optional thesis a buyer writes on the ticket; stored with the fill. */
export interface PreIpoThesis {
  note?: string;
  wrongIf?: string;
  /** Which leg the thesis rides on: the gap to the mark closing, or the mark itself rising. */
  leg?: Leg;
}

export interface PreIpoFill {
  token: PreIpoToken;
  /** Tokens received. */
  amount: number;
  /** Dollars spent. */
  dollars: number;
  settledIn: SettlementCurrency;
  settledAmount: number;
  signature: string;
  thesis?: PreIpoThesis;
}

/**
 * Puts a landed pre-IPO fill on the public tape with its thesis, when the
 * wallet is signed in. The server verifies the signature on-chain; the
 * gap and mark at the fill ride along so a later readout can say whether
 * the leg moved. Best effort: the swap already landed.
 */
async function publishPreIpoFill(wallet: string, fill: PreIpoFill) {
  const session = getStoredSession();
  if (!session || (session.kind === "wallet" && session.wallet !== wallet)) return;
  try {
    await fetch("/api/fills", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({
        signature: fill.signature,
        mint: fill.token.mint,
        side: "buy",
        quantity: fill.amount,
        pricePerShare: fill.amount > 0 ? fill.dollars / fill.amount : fill.token.tokenPrice,
        totalValue: fill.dollars,
        settledIn: fill.settledIn,
        settledAmount: fill.settledAmount,
        note: fill.thesis?.note,
        wrongIf: fill.thesis?.wrongIf,
        leg: fill.thesis?.leg,
        via: "ticket",
        gapAtBuy: Number.isFinite(fill.token.premiumPct) ? fill.token.premiumPct : undefined,
        refAtBuy: fill.token.markPrice > 0 ? fill.token.markPrice : undefined,
      }),
    });
  } catch {
    // The chain is the source of truth; the tape can catch up later.
  }
}

/**
 * A live buy of a pre-IPO token through the same Jupiter swap path as
 * xStock trades. Live mode only — there's no practice portfolio for
 * pre-IPO tokens, so without a wallet the UI offers a wallet connect
 * instead of a fake fill.
 */
export function usePreIpoBuy() {
  const { isLive } = useTradeMode();
  const { publicKey, signTransaction, wallet: connectedWallet } = useWallet();
  const deferred = isDeferredSigner(connectedWallet?.adapter);
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [fill, setFill] = useState<PreIpoFill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (token: PreIpoToken, dollars: number, payWith: SettlementCurrency, thesis?: PreIpoThesis) => {
      if (inFlight.current) return null;
      if (!isLive || !publicKey || !signTransaction) {
        setError("Connect a wallet and switch to live trading to buy pre-IPO tokens.");
        setStatus("error");
        return null;
      }
      inFlight.current = true;
      setStatus("pending");
      setError(null);
      try {
        const settle = SETTLEMENT[payWith];
        const swap = await executeLiveSwap(
          {
            inputMint: settle.mint,
            outputMint: token.mint,
            amountBaseUnits: settlementBaseUnits(dollars, payWith),
            inDecimals: settle.decimals,
            outDecimals: token.decimals,
          },
          { publicKey, signTransaction, deferred },
          { payWith, trade: { kind: "pre-ipo", symbol: token.symbol, name: COMPANIES[token.company].name } },
        );
        const settledAmount = fromBaseUnits(swap.inUnits, settle.decimals);
        const spent = settlementDollars(swap.inUsd, settledAmount, payWith);
        const result: PreIpoFill = {
          token,
          amount: fromBaseUnits(swap.outUnits, token.decimals),
          dollars: spent,
          settledIn: payWith,
          settledAmount,
          signature: swap.signature,
          thesis,
        };
        setFill(result);
        setStatus("success");
        void publishPreIpoFill(publicKey.toBase58(), result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        setError(/user rejected|rejected the request/i.test(message) ? "You cancelled the signature. Nothing was spent." : message);
        setStatus("error");
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [isLive, publicKey, signTransaction, deferred],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setFill(null);
    setError(null);
  }, []);

  return { status, fill, error, run, reset, isLive };
}
