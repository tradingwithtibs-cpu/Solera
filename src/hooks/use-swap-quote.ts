"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getUltraOrder, type UltraOrder } from "@/lib/jupiter";

export interface SwapQuoteParams {
  inputMint: string;
  outputMint: string;
  /** Base units of inputMint. Falsy/"0" disables the hook. */
  amountBaseUnits: string | null;
}

export interface SwapQuote {
  outAmount: string;
  priceImpactPct: number;
  /** Jupiter's fee, in basis points, taken from the trade. */
  feeBps: number;
  inUsdValue?: number;
  outUsdValue?: number;
}

const DEBOUNCE_MS = 400;

/**
 * A live, no-commitment quote from Jupiter Ultra for the review screen:
 * exact expected output, price impact, and fee, straight from the same
 * `/order` call the trade itself will use — never a locally-estimated
 * number. Debounced so retyping an amount doesn't spam Jupiter, and only
 * ever active while `params` is non-null (i.e. while reviewing). Includes
 * `taker` when a wallet is connected, since Ultra's fee can differ by
 * wallet (fee-sharing agreements, gasless eligibility).
 *
 * While disabled, this reads as "no quote" directly rather than clearing
 * state from inside the effect — every `setState` call here happens inside
 * the debounce timer's deferred callback, never synchronously during the
 * effect's own run.
 */
export function useSwapQuote(params: SwapQuoteParams | null): {
  quote: SwapQuote | null;
  isLoading: boolean;
  error: string | null;
} {
  const { publicKey } = useWallet();
  const [state, setState] = useState<{ quote: SwapQuote | null; isLoading: boolean; error: string | null }>({
    quote: null,
    isLoading: false,
    error: null,
  });
  const requestId = useRef(0);

  const inputMint = params?.inputMint;
  const outputMint = params?.outputMint;
  const amount = params?.amountBaseUnits;
  const enabled = !!inputMint && !!outputMint && !!amount && amount !== "0";
  const taker = publicKey?.toBase58();

  useEffect(() => {
    if (!enabled) return;
    const thisRequest = ++requestId.current;

    const timer = setTimeout(() => {
      // Everything below runs after the debounce delay — deferred, never
      // synchronous within the effect's own execution.
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      getUltraOrder({ inputMint: inputMint!, outputMint: outputMint!, amount: amount!, taker })
        .then((order: UltraOrder) => {
          if (thisRequest !== requestId.current) return; // a newer request superseded this one
          setState({
            quote: {
              outAmount: order.outAmount,
              priceImpactPct: order.priceImpactPct ? Number(order.priceImpactPct) : 0,
              feeBps: order.feeBps,
              inUsdValue: order.inUsdValue,
              outUsdValue: order.outUsdValue,
            },
            isLoading: false,
            error: null,
          });
        })
        .catch((err: unknown) => {
          if (thisRequest !== requestId.current) return;
          setState({ quote: null, isLoading: false, error: err instanceof Error ? err.message : "Quote unavailable" });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [enabled, inputMint, outputMint, amount, taker]);

  if (!enabled) return { quote: null, isLoading: false, error: null };
  return state;
}
