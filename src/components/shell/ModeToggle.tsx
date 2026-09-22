"use client";

import { useTradeMode } from "@/hooks/use-trade-mode";
import { useConnectWallet } from "../ConnectWalletProvider";

/**
 * Practice | Live · mainnet. Live lights up only when a wallet is actually
 * connected; with none, tapping Live opens the connect flow instead.
 */
export function ModeToggle() {
  const { mode, connected, setMode } = useTradeMode();
  const { openConnect } = useConnectWallet();
  return (
    <div className="mode" role="group" aria-label="Trading mode">
      <button type="button" data-mode="practice" aria-pressed={mode === "practice"} onClick={() => setMode("practice")}>
        Practice
      </button>
      <button
        type="button"
        data-mode="live"
        aria-pressed={mode === "live"}
        onClick={() => (connected ? setMode("live") : openConnect())}
        title={connected ? "Real swaps on Solana mainnet" : "Connect a wallet to trade for real"}
      >
        Live · mainnet
      </button>
    </div>
  );
}
