import Link from "next/link";
import { getTickerInfo } from "@/lib/catalog";
import { computeHoldings } from "@/lib/portfolio";
import type { Investor } from "@/lib/types";
import { Avatar } from "./Avatar";
import { PerformanceBadge } from "./PerformanceBadge";
import { FollowButton } from "./FollowButton";
export function InvestorCard({ investor }: { investor: Investor }) {
  const holdings = computeHoldings(investor.holdings);
  return (
    <article className="investor-card">
      <div className="flex items-start gap-3">
        <Link href={`/investor/${investor.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar initials={investor.initials} colorClass={investor.avatarColor} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{investor.name}</h3>
            <p className="text-xs text-neutral-500">{investor.handle}</p>
          </div>
        </Link>
        <FollowButton investorId={investor.id} />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-neutral-600">{investor.bio}</p>
      <div className="mt-5 flex items-center justify-between">
        <p className="eyebrow">Top holdings</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">{investor.kind === "wallet" ? "7 days" : "Month"}</span>
          <PerformanceBadge value={investor.performancePct} />
        </div>
      </div>
      <div className="holdings-preview">
        {holdings.slice(0, 3).map((h) => (
          <Link key={h.ticker} href={`/asset/${h.ticker}`}>
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <span className={`h-1.5 w-1.5 rounded-full ${getTickerInfo(h.ticker).color}`} />
              {h.ticker}
            </span>
            <span className="mt-1 font-mono text-sm">
              {h.allocationPct.toFixed(0)}
              <span className="text-xs text-neutral-400">%</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-4">
        <span className="text-xs text-neutral-500">
          <span className="font-mono">{holdings.length}</span> {holdings.length === 1 ? "position" : "positions"} ·{" "}
          {investor.kind === "wallet" ? "Live on-chain" : "Sample portfolio"}
        </span>
        <Link href={`/investor/${investor.id}`} className="text-sm font-semibold text-indigo-600">
          View portfolio <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </article>
  );
}
