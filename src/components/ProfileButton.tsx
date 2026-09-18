"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProfiles } from "@/hooks/use-profiles";
import { ProfileSheet } from "./ProfileSheet";

/** "Claim your profile" / "Edit profile" for the connected wallet; hidden when profiles aren't enabled. */
export function ProfileButton({ className = "" }: { className?: string }) {
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58() ?? null;
  const { get, configured } = useProfiles(address ? [address] : []);
  const profile = address ? get(address) : undefined;
  const [open, setOpen] = useState(false);
  // Hidden until we know: no wallet, lookup still pending, or profiles not enabled on this deployment.
  if (!address || profile === undefined || configured === false) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || "btn-secondary"}>
        {profile ? "Edit profile" : "Claim your profile"}
      </button>
      {open && <ProfileSheet existing={profile} onClose={() => setOpen(false)} />}
    </>
  );
}
