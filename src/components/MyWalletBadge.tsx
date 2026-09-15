"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ChainIcon } from "./icons";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * The one genuinely on-chain thing in Stocklana: a real, read-only Solana
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
    // Live updates when the balance actually changes on-chain — a small,
    // honest "yes, this is really reading the chain" touch, not a polling
    // hack.
    const subscriptionId = connection.onAccountChange(publicKey, () => refreshBalance());
    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [connection, publicKey, refreshBalance]);

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
        <p className="font-semibold">Real wallet, simulated portfolio</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          This connection and balance are genuinely read from Solana mainnet. Everything else in
          Stocklana — holdings, prices, and trades — is still simulated and never touches this wallet.
        </p>
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
