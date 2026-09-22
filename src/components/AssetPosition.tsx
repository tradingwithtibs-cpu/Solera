"use client";
import Link from "next/link";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { computeHoldings } from "@/lib/portfolio";
import { formatCurrency, formatShares } from "@/lib/format";
import type { TickerSymbol } from "@/lib/types";
export function AssetPosition({ ticker }: { ticker: TickerSymbol }) {
  const { holdings, isLoaded } = useActivePortfolio();
  const owned = computeHoldings(holdings).find((h) => h.ticker === ticker);
  return (
    <div className="mx-5 my-4 rounded-2xl border border-neutral-200 bg-panel p-5">
      {isLoaded && owned && (
        <div className="mb-4 flex flex-wrap justify-between gap-2 text-sm">
          <span>
            Your position · <span className="font-mono">{formatShares(owned.shares)}</span> shares
          </span>
          <span className="font-mono font-semibold">{formatCurrency(owned.value)}</span>
        </div>
      )}
      <div className="flex gap-3">
        <Link href={`/buy/${ticker}`} className="btn-primary flex-1">
          Buy {ticker}
        </Link>
        {isLoaded && owned && (
          <Link href={`/buy/${ticker}?side=sell`} className="btn-secondary flex-1">
            Sell {ticker}
          </Link>
        )}
      </div>
    </div>
  );
}
