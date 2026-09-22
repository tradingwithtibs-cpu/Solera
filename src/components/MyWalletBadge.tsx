"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useConnectWallet } from "./ConnectWalletProvider";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ChainIcon } from "./icons";
import { useTradeMode } from "@/hooks/use-trade-mode";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * The user's own wallet: connect button, address and SOL balance, and the
 * Live / Practice switch. Deliberately separate from OnChainBadge, which is
 * for *other* investors' wallets.
 */
export function MyWalletBadge() {
  const id = useId();
  const { connection } = useConnection();
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const { openConnect } = useConnectWallet();
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
      <button type="button" onClick={openConnect} disabled={connecting} className="btn-secondary btn-small">
        <ChainIcon className="h-3 w-3" />
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const address = publicKey.toBase58();

  return (
    <span className="inline-block">
      <button type="button" popoverTarget={id} className="wallet-pill" title={chosen === "live" ? "Live · Solana mainnet" : "Practice mode · wallet connected"}>
        <i className={chosen === "live" ? "" : "practice"} aria-hidden="true" />
        <span>{truncateAddress(address)}</span>
        {balance !== null && <small>{balance.toFixed(3)} SOL</small>}
      </button>
      <div id={id} popover="auto" className="wallet-popover">
        <p className="eyebrow">{chosen === "live" ? "Live · Solana mainnet" : "Practice mode"}</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          {chosen === "live"
            ? "Trades are real swaps on Solana mainnet through Jupiter, paid in SOL or USDC from this wallet. Your portfolio shows what this wallet actually holds."
            : "Trades are simulated with practice funds. Nothing touches this wallet. Switch to live when you're ready to trade for real."}
        </p>
        <div className="mode mt-3 flex w-full" role="group" aria-label="Trading mode">
          <button type="button" data-mode="live" aria-pressed={chosen === "live"} onClick={() => setMode("live")}>
            Live
          </button>
          <button type="button" data-mode="practice" aria-pressed={chosen === "practice"} onClick={() => setMode("practice")}>
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
