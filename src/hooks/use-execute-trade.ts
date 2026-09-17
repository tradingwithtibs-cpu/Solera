"use client";

import { useCallback, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { executeTrade, type TradeParams, type TradeResult } from "@/lib/trade";
import { useTradeMode } from "./use-trade-mode";

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
  const { publicKey, signTransaction } = useWallet();

  const inFlight = useRef(false);
  const run = useCallback(
    async (params: TradeParams, onFilled?: (result: TradeResult) => void) => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setStatus("pending");
      setError(null);
      try {
        const wallet =
          isLive && publicKey && signTransaction ? { publicKey, signTransaction } : undefined;
        if (isLive && !wallet) throw new Error("Connect a wallet that can sign transactions.");
        const res = await executeTrade(params, wallet);
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
    [isLive, publicKey, signTransaction],
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
