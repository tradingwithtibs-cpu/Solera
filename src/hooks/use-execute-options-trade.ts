"use client";

import { useCallback, useRef, useState } from "react";
import { executeOptionsTrade, type OptionsTradeParams, type OptionsTradeResult } from "@/lib/options-trade";

export type OptionsTradeStatus = "idle" | "pending" | "success" | "error";

/**
 * Thin state wrapper around `executeOptionsTrade()` for use in components —
 * same shape as `useExecuteTrade`. Swapping the mock inside
 * executeOptionsTrade for a real on-chain options fill later requires no
 * changes here.
 */
export function useExecuteOptionsTrade() {
  const [status, setStatus] = useState<OptionsTradeStatus>("idle");
  const [result, setResult] = useState<OptionsTradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef(false);
  const run = useCallback(
    async (params: OptionsTradeParams, onFilled?: (result: OptionsTradeResult) => void) => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setStatus("pending");
      setError(null);
      try {
        const res = await executeOptionsTrade(params);
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
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, run, reset };
}
