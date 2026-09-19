"use client";

import { useCallback, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { executeLiveSwap, settlementBaseUnits, settlementDollars } from "@/lib/trade";
import { SETTLEMENT, fromBaseUnits, type SettlementCurrency } from "@/lib/tokens";
import { isDeferredSigner } from "@/lib/deferred-signing";
import { COMPANIES, type PreIpoToken } from "@/lib/pre-ipo";
import { useTradeMode } from "./use-trade-mode";

export interface PreIpoFill {
  token: PreIpoToken;
  /** Tokens received. */
  amount: number;
  /** Dollars spent. */
  dollars: number;
  settledIn: SettlementCurrency;
  settledAmount: number;
  signature: string;
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
    async (token: PreIpoToken, dollars: number, payWith: SettlementCurrency) => {
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
        };
        setFill(result);
        setStatus("success");
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
