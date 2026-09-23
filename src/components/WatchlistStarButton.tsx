"use client";

import { useWatchlist } from "@/hooks/use-watchlist";
import type { TickerSymbol } from "@/lib/types";

/** The ★ beside a symbol: `.star` from the design system, amber when on. Stops the click so a row behind it does not select. */
export function WatchlistStarButton({ ticker, size = "md", className = "" }: { ticker: TickerSymbol; size?: "sm" | "md"; className?: string }) {
  const { isWatched, toggleWatch } = useWatchlist();
  const watched = isWatched(ticker);

  return (
    <button
      type="button"
      aria-pressed={watched}
      onClick={(e) => {
        e.stopPropagation();
        toggleWatch(ticker);
      }}
      aria-label={watched ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`}
      title={watched ? "On your watchlist" : "Watch"}
      className={`star ${watched ? "on" : ""} ${size === "sm" ? "star-sm" : ""} ${className}`.replace(/\s+/g, " ").trim()}
    >
      ★
    </button>
  );
}
