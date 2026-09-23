"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { computeHoldings } from "@/lib/portfolio";
import { useInvestors } from "@/hooks/use-investors";
import type { TickerSymbol } from "@/lib/types";

const LIMIT = 6;

/** The real wallets holding a ticker, largest allocation first, with their 7-day move. */
export function HeldBy({ ticker }: { ticker: TickerSymbol }) {
  const { investors, source, isLoaded } = useInvestors();
  const holders = investors
    .map((investor) => ({ investor, holding: computeHoldings(investor.holdings).find((h) => h.ticker === ticker) }))
    .filter((e): e is { investor: (typeof investors)[number]; holding: NonNullable<typeof e.holding> } => !!e.holding)
    .sort((a, b) => b.holding.allocationPct - a.holding.allocationPct)
    .slice(0, LIMIT);

  if (!isLoaded) {
    return (
      <p className="asset-note" aria-busy="true">
        Reading holders on Solana…
      </p>
    );
  }
  if (holders.length === 0) return <p className="asset-note">No wallets to show for {ticker} yet.</p>;

  return (
    <div>
      {source === "sample" && <p className="asset-note">Sample investors holding {ticker}</p>}
      {holders.map(({ investor, holding }) => (
        <Link key={investor.id} href={`/investor/${investor.id}`} className="held-row">
          <Avatar initials={investor.initials} colorClass={investor.avatarColor} size="sm" />
          <span className="min-w-0">
            <b>{investor.name}</b>
            <small>{holding.allocationPct.toFixed(0)}% of their portfolio</small>
          </span>
          <em className={investor.performancePct >= 0 ? "up" : "down"}>
            {investor.performancePct >= 0 ? "+" : "−"}
            {Math.abs(investor.performancePct).toFixed(1)}%
          </em>
        </Link>
      ))}
    </div>
  );
}
