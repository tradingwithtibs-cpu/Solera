"use client";

import { useWatchlist } from "@/hooks/use-watchlist";
import type { TickerSymbol } from "@/lib/types";
import { StarIcon } from "./icons";

export function WatchlistStarButton({ ticker, size = "md" }: { ticker: TickerSymbol; size?: "sm" | "md" }) {
  const { isWatched, toggleWatch } = useWatchlist();
  const watched = isWatched(ticker);

  return (
    <button
      type="button"
      aria-pressed={watched}
      onClick={() => toggleWatch(ticker)}
      aria-label={watched ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`}
      className="text-amber-400"
    >
      <StarIcon className={size === "md" ? "h-6 w-6" : "h-5 w-5"} filled={watched} />
    </button>
  );
}
