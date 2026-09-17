"use client";
import { useId } from "react";
import { ChainIcon } from "./icons";
export function OnChainBadge({ walletAddress, verified = false }: { walletAddress: string; verified?: boolean }) {
  const id = useId();
  if (verified) {
    return (
      <a
        href={`https://solscan.io/account/${walletAddress}`}
        target="_blank"
        rel="noreferrer"
        className="bg-gradient-solana inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
      >
        <ChainIcon className="h-3 w-3" />
        On-chain · Solscan ↗
      </a>
    );
  }
  return (
    <span className="inline-block">
      <button
        type="button"
        popoverTarget={id}
        className="bg-gradient-solana inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
      >
        <ChainIcon className="h-3 w-3" />
        Solana · Demo
      </button>
      <div id={id} popover="auto" className="wallet-popover">
        <p className="font-semibold">Solana verification is coming</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          This is a sample wallet. Holdings and returns are simulated and have not been verified on-chain.
        </p>
        <p className="mt-4 break-all font-mono text-xs text-neutral-500">{walletAddress}</p>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" className="btn-secondary mt-4">
          Close
        </button>
      </div>
    </span>
  );
}
