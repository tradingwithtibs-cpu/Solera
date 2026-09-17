"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ChainIcon } from "./icons";
import { useTradeMode } from "@/hooks/use-trade-mode";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * The user's wallet: a real Solana
 * wallet connection and a real mainnet balance read (see SolanaProvider.tsx).
 * Deliberately separate from OnChainBadge, which shows *other* investors'
 * mock wallet addresses — there's no "connect" story for someone else's
 * wallet, so that one stays purely illustrative. This one is for the
 * signed-in user's own portfolio only, and connecting here never touches
 * the mock portfolio below it: holdings, prices, and trades stay simulated
 * either way, and the popover says so explicitly so a connected wallet is
 * never mistaken for "this is where your real money is."
 */
export function MyWalletBadge() {
  const id = useId();
  const { connection } = useConnection();
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [balance, setBalance] = useState<number | null>(null);
  const { chosen, setMode } = useTradeMode();

  const refreshBalance = useCallback(async () => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    try {
      const lamports = await connection.getBalance(publicKey);
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch {
      setBalance(null);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    // A genuine "fetch from an external system on mount/change" effect —
    // the async chain only calls setState after the network round trip,
    // never synchronously during this effect's own execution.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshBalance();
    if (!publicKey) return;
    // Polled rather than subscribed: the public mainnet RPC rejects browser
    // websockets, which surfaced as a "ws error" console error.
    const interval = setInterval(refreshBalance, 20_000);
    return () => clearInterval(interval);
  }, [publicKey, refreshBalance]);

  if (!connected || !publicKey) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        disabled={connecting}
        className="bg-gradient-solana inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
      >
        <ChainIcon className="h-3 w-3" />
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const address = publicKey.toBase58();

  return (
    <span className="inline-block">
      <button
        type="button"
        popoverTarget={id}
        className="bg-gradient-solana inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
      >
        <ChainIcon className="h-3 w-3" />
        <span className="font-mono">{truncateAddress(address)}</span>
        {balance !== null && <span className="font-mono">· {balance.toFixed(4)} SOL</span>}
      </button>
      <div id={id} popover="auto" className="wallet-popover">
        <p className="font-semibold">{chosen === "live" ? "Live trading" : "Practice mode"}</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          {chosen === "live"
            ? "Trades are real swaps on Solana mainnet through Jupiter, paid in SOL or USDC from this wallet. Your portfolio shows what this wallet actually holds."
            : "Trades are simulated with practice funds. Nothing touches this wallet. Switch to live when you're ready to trade for real."}
        </p>
        <div className="mt-3 flex rounded-full bg-neutral-100 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode("live")}
            className={`flex-1 rounded-full py-1.5 ${chosen === "live" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            Live
          </button>
          <button
            type="button"
            onClick={() => setMode("practice")}
            className={`flex-1 rounded-full py-1.5 ${chosen === "practice" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            Practice
          </button>
        </div>
        <p className="mt-4 break-all font-mono text-xs text-neutral-500">{address}</p>
        <p className="mt-2 font-mono text-sm font-semibold text-neutral-900">
          {balance !== null ? `${balance.toFixed(4)} SOL` : "Fetching balance…"}
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="btn-secondary flex-1">
            Close
          </button>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            onClick={() => disconnect()}
            className="btn-secondary flex-1 text-rose-600"
          >
            Disconnect
          </button>
        </div>
      </div>
    </span>
  );
}
