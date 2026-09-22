"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTradeMode } from "@/hooks/use-trade-mode";
import { Logo } from "../Logo";
import { MyWalletBadge } from "../MyWalletBadge";
import { ModeToggle } from "./ModeToggle";
import { SearchGlyph } from "../icons";
import { openPalette } from "./Palette";

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
        <MyWalletBadge />
      </div>
    </header>
  );
}
