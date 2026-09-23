"use client";

import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Avatar } from "./Avatar";
import { useConnectWallet } from "./ConnectWalletProvider";
import { useTradeMode } from "@/hooks/use-trade-mode";
import { useAuthUser } from "@/hooks/use-auth-user";
import { avatarColorFor, shortAddress } from "@/lib/investors";
import { useProfile } from "@/hooks/use-profiles";
import { openAuthSheet } from "./auth/auth-sheet-store";

/** The account block at the bottom of the desktop sidebar: the wallet, the email account, or a way in. */
export function SidebarAccount() {
  const { connected, publicKey } = useWallet();
  const { openConnect } = useConnectWallet();
  const { isLive } = useTradeMode();
  const user = useAuthUser();
  const address = connected && publicKey ? publicKey.toBase58() : null;
  const profile = useProfile(address ?? user?.id);

  if (address) {
    return (
      <Link href="/portfolio" className="mt-4 flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 hover:bg-hover">
        <Avatar initials={profile?.name?.slice(0, 2).toUpperCase() ?? address.slice(0, 2).toUpperCase()} colorClass={avatarColorFor(address)} size="sm" />
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${profile ? "" : "font-mono"}`}>{profile?.name ?? shortAddress(address)}</p>
          <p className="text-xs text-neutral-500">{isLive ? "Live · Solana mainnet" : "Practice mode"}</p>
        </div>
      </Link>
    );
  }
  if (user) {
    const displayName = typeof user.user_metadata?.display_name === "string" ? (user.user_metadata.display_name as string) : undefined;
    const name = profile?.name ?? displayName ?? user.email ?? "Account";
    return (
      <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2">
        <Avatar initials={name.slice(0, 2).toUpperCase()} colorClass={avatarColorFor(user.id)} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-xs text-neutral-500">Email account · practice</p>
          <button type="button" onClick={openConnect} className="text-xs text-accent-text">
            Link a wallet →
          </button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => openAuthSheet("signup")} className="mt-4 flex w-full items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 text-left hover:bg-hover">
      <Avatar initials="?" colorClass="bg-neutral-300" size="sm" />
      <div>
        <p className="text-sm font-semibold">Guest</p>
        <p className="text-xs text-accent-text">Log in or sign up →</p>
      </div>
    </button>
  );
}
