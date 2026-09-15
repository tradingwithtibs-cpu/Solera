"use client";
import Link from "next/link";
import { usePortfolio } from "@/hooks/use-portfolio";
import { computeHoldings, computeTrendingTickers } from "@/lib/portfolio";
import { TICKERS } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/format";
import { TickerBadge } from "./TickerBadge";
export function DiscoveryRail() {
  const { cashBalance, holdings, isLoaded } = usePortfolio();
  const total = computeHoldings(holdings).reduce((sum, h) => sum + h.value, cashBalance);
  return (
    <aside className="discovery-rail">
      <div className="rail-card">
        <p className="eyebrow">Your practice portfolio</p>
        <p className="mt-4 font-mono text-2xl font-semibold">{isLoaded ? formatCurrency(total) : "—"}</p>
        <div className="mt-4 flex justify-between text-xs text-neutral-500">
          <span>Available cash</span>
          <span className="font-mono">{isLoaded ? formatCurrency(cashBalance) : "—"}</span>
        </div>
        <Link href="/portfolio" className="btn-secondary mt-5 w-full">
          View portfolio ↗
        </Link>
      </div>
      <div className="rail-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Community favorites</h2>
          <span className="text-violet-500" aria-hidden="true">
            ↗
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-500">By total demo holdings</p>
        <div className="mt-4 divide-y divide-neutral-100">
          {computeTrendingTickers()
            .slice(0, 3)
            .map((t) => (
              <Link key={t.ticker} href={`/asset/${t.ticker}`} className="flex items-center gap-3 py-3">
                <TickerBadge ticker={TICKERS[t.ticker]} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.ticker}</p>
                  <p className="text-xs text-neutral-500">{t.holderCount} investors</p>
                </div>
              </Link>
            ))}
        </div>
        <Link href="/markets" className="mt-4 block text-sm font-semibold text-indigo-600">
          Explore all markets →
        </Link>
      </div>
      <p className="px-2 text-xs leading-relaxed text-neutral-500">
        A space to practice and learn. Profiles, holdings, and returns are examples. Nothing here places a
        real trade.
      </p>
    </aside>
  );
}
