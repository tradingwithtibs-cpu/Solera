"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Avatar } from "./Avatar";
import { useConnectWallet } from "./ConnectWalletProvider";
import { useTradeMode } from "@/hooks/use-trade-mode";
import { avatarColorFor, shortAddress } from "@/lib/investors";
import { useProfile } from "@/hooks/use-profiles";

/** The account block at the bottom of the desktop sidebar: the wallet, or a way to connect one. */
export function SidebarAccount() {
  const { connected, publicKey } = useWallet();
  const { openConnect } = useConnectWallet();
  const { isLive } = useTradeMode();
  const profile = useProfile(publicKey?.toBase58());

  if (connected && publicKey) {
    const address = publicKey.toBase58();
    return (
      <Link href="/portfolio" className="mt-4 flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 hover:bg-hover">
        <Avatar initials={profile?.name?.slice(0, 2).toUpperCase() ?? address.slice(0, 2).toUpperCase()} colorClass={avatarColorFor(address)} size="sm" />
        <div>
          <p className={`text-sm font-semibold ${profile ? "" : "font-mono"}`}>{profile?.name ?? shortAddress(address)}</p>
          <p className="text-xs text-neutral-500">{isLive ? "Live · Solana mainnet" : "Practice mode"}</p>
        </div>
      </Link>
    );
  }
  return (
    <button type="button" onClick={openConnect} className="mt-4 flex w-full items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 text-left hover:bg-hover">
      <Avatar initials="?" colorClass="bg-neutral-300" size="sm" />
      <div>
        <p className="text-sm font-semibold">Guest</p>
        <p className="text-xs text-accent-text">Connect a wallet →</p>
      </div>
    </button>
  );
}
