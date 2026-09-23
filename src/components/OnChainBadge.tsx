"use client";
import { useId } from "react";
import { ChainIcon } from "./icons";
import { shortAddress } from "@/lib/investors";

// Solana named with a gradient border on ink, never white text on mint (design-system §4.12).
const BADGE = "badge-solana rounded-lg px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]";

/** A real wallet links to Solscan; a sample wallet explains itself in a popover. */
export function OnChainBadge({ walletAddress, verified = false }: { walletAddress: string; verified?: boolean }) {
  const id = useId();
  if (verified) {
    return (
      <a href={`https://solscan.io/account/${walletAddress}`} target="_blank" rel="noreferrer" className={BADGE}>
        <ChainIcon className="h-3 w-3" />
        On-chain · Solscan ↗
      </a>
    );
  }
  return (
    <span className="inline-block">
      <button type="button" popoverTarget={id} className={BADGE}>
        <ChainIcon className="h-3 w-3" />
        Sample wallet
      </button>
      <div id={id} popover="auto" className="wallet-popover">
        <p className="eyebrow">Sample</p>
        <p className="mt-2 text-base font-semibold text-fg">Solana verification is coming</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This is a sample wallet. Holdings and returns are simulated and have not been verified on-chain.
        </p>
        <p className="mt-4 font-mono text-xs text-muted">{shortAddress(walletAddress)}</p>
        <button type="button" popoverTarget={id} popoverTargetAction="hide" className="btn-secondary btn-small mt-4">
          Close
        </button>
      </div>
    </span>
  );
}
