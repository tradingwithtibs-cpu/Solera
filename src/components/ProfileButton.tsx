"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useProfiles } from "@/hooks/use-profiles";
import { ProfileSheet } from "./ProfileSheet";

/** "Claim your profile" / "Edit profile" for the connected wallet or the email account; hidden when profiles aren't enabled. */
export function ProfileButton({ className = "" }: { className?: string }) {
  const { publicKey } = useWallet();
  const user = useAuthUser();
  const owner = publicKey?.toBase58() ?? user?.id ?? null;
  const { get, configured } = useProfiles(owner ? [owner] : []);
  const profile = owner ? get(owner) : undefined;
  const [open, setOpen] = useState(false);
  // Hidden until we know: nobody signed in, lookup still pending, or profiles not enabled on this deployment.
  if (!owner || profile === undefined || configured === false) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className || "btn-secondary"}>
        {profile ? "Edit profile" : "Claim your profile"}
      </button>
      {open && <ProfileSheet existing={profile} onClose={() => setOpen(false)} />}
    </>
  );
}
