"use client";

import { useCallback, useRef, useState } from "react";
import { executeTrade, type TradeParams, type TradeResult } from "@/lib/trade";

export type TradeStatus = "idle" | "pending" | "success" | "error";

/**
 * Thin state wrapper around `executeTrade()` for use in components.
 * Swapping the mock inside `executeTrade` for a real Solana/Jupiter call
 * later requires no changes here.
 */
export function useExecuteTrade() {
  const [status, setStatus] = useState<TradeStatus>("idle");
  const [result, setResult] = useState<TradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef(false);
  const run = useCallback(async (params: TradeParams, onFilled?: (result: TradeResult) => void) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setStatus("pending");
    setError(null);
    try {
      const res = await executeTrade(params);
      onFilled?.(res);
      setResult(res);
      setStatus("success");
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
      return null;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, run, reset };
}
