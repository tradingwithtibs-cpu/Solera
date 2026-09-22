"use client";

import { useCallback, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { executeTrade, type TradeParams, type TradeResult } from "@/lib/trade";
import { isDeferredSigner } from "@/lib/deferred-signing";
import { useTradeMode } from "./use-trade-mode";
import { useSession } from "./use-session";
import { applyServerPractice, getServerPracticeVersion } from "./use-portfolio";
import type { PracticeRow } from "@/lib/fills";
import type { Transaction } from "@/lib/types";

export type TradeStatus = "idle" | "pending" | "success" | "error";

/**
 * Thin state wrapper around `executeTrade()` for use in components. In live
 * mode it hands the connected wallet to the trade so Jupiter's transaction
 * can be signed; in practice mode no wallet is passed and the fill is
 * simulated.
 */
export function useExecuteTrade() {
  const [status, setStatus] = useState<TradeStatus>("idle");
  const [result, setResult] = useState<TradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isLive } = useTradeMode();
  const { publicKey, signTransaction, wallet: connectedWallet } = useWallet();
  const deferred = isDeferredSigner(connectedWallet?.adapter);
  const { signedIn, owner, token } = useSession();

  const inFlight = useRef(false);
  const run = useCallback(
    async (params: TradeParams, onFilled?: (result: TradeResult) => void) => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setStatus("pending");
      setError(null);
      try {
        const wallet =
          isLive && publicKey && signTransaction ? { publicKey, signTransaction, deferred } : undefined;
        if (isLive && !wallet) throw new Error("Connect a wallet that can sign transactions.");
        const res =
          !isLive && signedIn && owner && token ? await executeServerPracticeFill(params, owner, token) : await executeTrade(params, wallet);
        onFilled?.(res);
        setResult(res);
        setStatus("success");
        return res;
      } catch (err) {
        setError(friendlyError(err));
        setStatus("error");
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [isLive, publicKey, signTransaction, deferred, signedIn, owner, token],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, run, reset, isLive };
}

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Something went wrong";
  if (/user rejected|rejected the request|cancel/i.test(message)) return "You cancelled the signature. Nothing was spent.";
  return message;
}

/** A signed-in practice order: the server prices and settles it; the reply replaces the practice snapshot. */
async function executeServerPracticeFill(params: TradeParams, owner: string, token: string): Promise<TradeResult> {
  const res = await fetch("/api/practice/fill", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      ticker: params.ticker,
      side: params.side,
      ...(params.side === "buy" ? { amountUsd: params.totalValue } : { quantity: params.quantity }),
      note: params.note,
      wrongIf: params.wrongIf,
      leg: params.leg,
      via: params.via ?? "ticket",
      planId: params.planId,
      copiedFrom: params.copiedFromInvestorId,
      expectedVersion: getServerPracticeVersion(),
    }),
  });
  const data = (await res.json()) as { error?: string; portfolio?: PracticeRow; transaction?: Transaction; result?: TradeResult };
  if (!res.ok || !data.result || !data.portfolio) {
    if (data.portfolio) applyServerPractice(owner, data.portfolio);
    throw new Error(data.error ?? "Couldn't place that practice order.");
  }
  applyServerPractice(owner, data.portfolio, undefined, data.transaction);
  return data.result;
}
