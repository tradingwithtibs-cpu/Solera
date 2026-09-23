"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useTradeMode } from "@/hooks/use-trade-mode";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useProfile } from "@/hooks/use-profiles";
import { avatarColorFor, shortAddress } from "@/lib/investors";
import { fillFor } from "@/lib/palette";
import { openAuthSheet } from "../auth/auth-sheet-store";
import { InboxBell } from "../inbox/InboxBell";
import { Logo } from "../Logo";
import { MyWalletBadge } from "../MyWalletBadge";
import { ModeToggle } from "./ModeToggle";
import { SearchGlyph } from "../icons";
import { openPalette } from "./Palette";

/** LOG IN / SIGN UP when nobody is signed in; the me-pill (opens the account sheet) once a wallet or an email account is. */
function AuthGroup() {
  const { connected, publicKey } = useWallet();
  const user = useAuthUser();
  const address = connected && publicKey ? publicKey.toBase58() : null;
  const owner = address ?? user?.id ?? null;
  const profile = useProfile(owner);
  if (!owner) {
    return (
      <>
        <span className="auth-desktop">
          <button type="button" className="btn-secondary btn-small" onClick={() => openAuthSheet("login")}>
            Log in
          </button>
          <button type="button" className="btn-primary btn-small" onClick={() => openAuthSheet("signup")}>
            Sign up
          </button>
        </span>
        <button type="button" className="auth-phone me-avatar" onClick={() => openAuthSheet("signup")} aria-label="Log in or sign up">
          <span className="avatar sm" aria-hidden="true">
            ?
          </span>
        </button>
      </>
    );
  }
  const displayName = typeof user?.user_metadata?.display_name === "string" ? (user.user_metadata.display_name as string) : undefined;
  const name = profile?.name ?? displayName ?? (address ? shortAddress(address) : "Account");
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
  const avatar = (
    <span className="avatar sm" style={{ background: fillFor(avatarColorFor(owner), initials) }} aria-hidden="true">
      {initials}
    </span>
  );
  return (
    <>
      <button type="button" className="me-pill auth-desktop" onClick={() => openAuthSheet("account")} aria-label="Your account">
        {avatar}
        <span className="truncate">{name}</span>
        {address && profile?.name && <small>{shortAddress(address)}</small>}
      </button>
      <button type="button" className="auth-phone me-avatar" onClick={() => openAuthSheet("account")} aria-label={`Your account, ${name}`}>
        {avatar}
      </button>
    </>
  );
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const frame = requestAnimationFrame(tick);
    const interval = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, []);
  return now;
}

/**
 * The sticky glass top bar: masthead (date and edition) on desktop, the
 * mark on phones; the ⌘K search; the mode toggle, clock and wallet pill.
 * The edition label says "Mainnet" only when a wallet is really connected.
 */
export function Masthead() {
  const { mode } = useTradeMode();
  const now = useClock();

  useEffect(() => {
    document.body.dataset.mode = mode;
  }, [mode]);

  const date = now
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(now)
    : "";
  const clock = now
    ? now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";

  return (
    <header className="top glass">
      <div className="masthead">
        <b>{mode === "live" ? "Mainnet edition" : "Practice edition"}</b>
        <small>{date || " "}</small>
      </div>
      <Link href="/" className="brand md:hidden" aria-label="Solera home">
        <Logo size={32} />
      </Link>
      <div className="top-mid">
        <button type="button" className="search-btn field" onClick={() => openPalette()} aria-label="Search tickers, people, notes">
          <SearchGlyph className="h-4 w-4 shrink-0" />
          <span>Search tickers, people, notes</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
      <div className="top-right">
        <ModeToggle />
        <span className="clock" aria-hidden="true">
          {clock}
        </span>
        <InboxBell />
        <span className="wallet-slot">
          <MyWalletBadge />
        </span>
        <AuthGroup />
      </div>
    </header>
  );
}
