"use client";

import { useId, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuthUser, useRecoveryPending } from "@/hooks/use-auth-user";
import { useProfile } from "@/hooks/use-profiles";
import { useSession } from "@/hooks/use-session";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { avatarColorFor, shortAddress } from "@/lib/investors";
import { fillFor } from "@/lib/palette";
import { formatCurrency } from "@/lib/format";
import { MY_CASH_BALANCE } from "@/lib/mock-data";
import { useConnectWallet } from "../ConnectWalletProvider";
import { ProfileButton } from "../ProfileButton";
import { ChainIcon } from "../icons";
import { Sheet, SheetHead } from "./Sheet";
import { EmailForm, NewPasswordForm } from "./EmailForm";
import { setAuthSheetMode, type AuthSheetMode } from "./auth-sheet-store";

/**
 * Log in / Sign up, and the account sheet once someone is in. The wallet is
 * the trading identity: "Continue with wallet" runs the existing connect
 * flow and then offers the profile claim. The email form runs on Supabase
 * Auth and trades its token for Solera's own 30-day session.
 */
export function AuthSheet({ mode, onClose }: { mode: AuthSheetMode; onClose: () => void }) {
  const id = useId();
  const { publicKey, connected, connecting, wallet, disconnect } = useWallet();
  const address = connected ? (publicKey?.toBase58() ?? null) : null;
  const authUser = useAuthUser();
  const owner = address ?? authUser?.id ?? null;
  const profile = useProfile(owner);
  const { openConnect } = useConnectWallet();
  const session = useSession();
  const [walletFlow, setWalletFlow] = useState(false);
  const [busy, setBusy] = useState(false);
  const recovering = useRecoveryPending();

  const walletName = wallet?.adapter.name ?? "a wallet";
  const metaName = typeof authUser?.user_metadata?.display_name === "string" ? (authUser.user_metadata.display_name as string) : undefined;
  const name = profile?.name ?? metaName ?? (address ? shortAddress(address) : "Your account");
  const initials = (profile?.name ?? metaName ?? address ?? "?").slice(0, 2).toUpperCase();

  async function logOut() {
    setBusy(true);
    try {
      if (address) await disconnect();
      if (authUser) {
        await getSupabaseBrowser()?.auth.signOut();
        session.signOut();
      }
    } finally {
      setBusy(false);
      onClose();
    }
  }

  // Just connected from this sheet: offer the profile claim before going back.
  if (walletFlow && address) {
    return (
      <Sheet labelledBy={id} onClose={onClose} narrow>
        <SheetHead eyebrow="Wallet" title="Wallet connected." id={id} onClose={onClose} />
        <p className="sheet-text">
          You&apos;re on Solera as <b className="font-mono">{shortAddress(address)}</b> through {walletName}. Claim a profile so people see a name instead of an
          address. It&apos;s one signature, and it can&apos;t move funds.
        </p>
        <div className="sheet-actions">
          <ProfileButton className="btn-primary" />
          <button type="button" className="btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>
        <p className="sheet-foot">Practice or live is the toggle in the top bar. Live trades are signed in your wallet, never by Solera.</p>
      </Sheet>
    );
  }

  if (address || authUser) {
    return (
      <Sheet labelledBy={id} onClose={onClose} narrow>
        <SheetHead
          eyebrow="Your account"
          id={id}
          onClose={onClose}
          title={
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="avatar sm" style={{ background: fillFor(avatarColorFor(owner ?? name), initials) }} aria-hidden="true">
                {initials}
              </span>
              <span className="truncate">{name}</span>
              {profile && <span className="font-mono text-[11px] font-medium text-accent-text">@{profile.handle}</span>}
            </span>
          }
        />
        <p className="sheet-text">
          {address && (
            <>
              {session.signedIn ? "Signed in" : "Connected"} with <b>{walletName}</b> · <span className="font-mono">{shortAddress(address)}</span>
            </>
          )}
          {address && authUser?.email && <br />}
          {authUser?.email && (
            <>
              Email account · <b>{authUser.email}</b>
            </>
          )}
        </p>
        {address && !session.signedIn && (
          <div className="mb-3 rounded-[var(--radius-control)] border border-line bg-inset p-3">
            <p className="text-xs text-fg">Posting, notes and plans need one signature from this wallet.</p>
            <button
              type="button"
              className="btn-live mt-2 w-full"
              onClick={session.signIn}
              disabled={session.status === "signing" || !session.canSign}
              aria-busy={session.status === "signing"}
            >
              {session.status === "signing" ? "Waiting for your wallet…" : "Sign in with wallet"}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">One signature, good for 30 days. It can&apos;t move funds.</p>
            {session.error && (
              <p role="alert" className="field-error">
                {session.error}
              </p>
            )}
          </div>
        )}
        {address && session.signedIn && (
          <p className="mb-3">
            <span className="chip live">Signed in · 30 days</span>
          </p>
        )}
        {authUser && recovering && <NewPasswordForm />}
        <div className="sheet-actions">
          <ProfileButton className="btn-secondary" />
          {!address && (
            <button type="button" className="btn-secondary" onClick={openConnect}>
              <ChainIcon className="h-3.5 w-3.5" />
              Link a wallet
            </button>
          )}
          <button type="button" className="btn-ghost ml-auto" onClick={logOut} disabled={busy} aria-busy={busy}>
            {address ? "Disconnect" : "Log out"}
          </button>
        </div>
        <p className="sheet-foot">
          {address
            ? "Live trades are signed in your wallet, never by Solera. Practice trades never touch it."
            : "Email accounts browse and practice. Link a wallet to trade live."}
        </p>
      </Sheet>
    );
  }

  const tab = mode === "login" ? "login" : "signup";
  return (
    <Sheet labelledBy={id} onClose={onClose} narrow>
      <header className="sheet-head">
        <div className="seg" role="group" aria-label="Log in or sign up">
          <button type="button" aria-pressed={tab === "login"} onClick={() => setAuthSheetMode("login")}>
            Log in
          </button>
          <button type="button" aria-pressed={tab === "signup"} onClick={() => setAuthSheetMode("signup")}>
            Sign up
          </button>
        </div>
        <button type="button" className="btn-ghost btn-icon -mr-2 -mt-1 text-base" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <h3 id={id} className="mt-3">
        {tab === "signup" ? "Create an account" : "Welcome back"}
      </h3>
      <p className="sheet-text">
        {tab === "signup"
          ? `A name people see on the tape, and a way back in. Practice cash to start (${formatCurrency(MY_CASH_BALANCE)}); nothing here moves real money until you link a wallet.`
          : "Use the email you signed up with, or your wallet."}
      </p>
      <EmailForm tab={tab} onSignedIn={() => setAuthSheetMode("account")} />
      <div className="my-3 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <button
        type="button"
        className="btn-secondary w-full"
        disabled={connecting}
        aria-busy={connecting}
        onClick={() => {
          setWalletFlow(true);
          openConnect();
        }}
      >
        <ChainIcon className="h-3.5 w-3.5" />
        {connecting ? "Connecting…" : "Continue with wallet"}
      </button>
      <p className="sheet-foot">
        Your wallet signs nothing at sign-up. The first time you post, one signature (good for 30 days) proves it&apos;s yours. No transaction, no fee.
      </p>
    </Sheet>
  );
}
