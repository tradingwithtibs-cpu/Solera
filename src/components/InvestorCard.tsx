import Link from "next/link";
import { getTickerInfo } from "@/lib/catalog";
import { computeHoldings } from "@/lib/portfolio";
import { fillFor } from "@/lib/palette";
import { formatPercent } from "@/lib/format";
import type { Investor } from "@/lib/types";
import { Avatar } from "./Avatar";
import { FollowButton } from "./FollowButton";

/** One investor as a card: name, bio, top three holdings, the move of what they hold. On the ink tokens. */
export function InvestorCard({ investor }: { investor: Investor }) {
  const holdings = computeHoldings(investor.holdings);
  const move = investor.performancePct;
  return (
    <article className="investor-card rounded-xl border border-line bg-panel" data-holder={investor.id}>
      <div className="flex items-start gap-3">
        <Link href={`/investor/${investor.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar initials={investor.initials} colorClass={investor.avatarColor} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-fg">{investor.name}</h3>
            <p className="font-mono text-xs text-muted">{investor.handle}</p>
          </div>
        </Link>
        <FollowButton investorId={investor.id} name={investor.name} />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted">{investor.bio}</p>
      <div className="mt-5 flex items-center justify-between">
        <p className="eyebrow">Top holdings</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{investor.kind === "wallet" ? "7 days" : "Month"}</span>
          <span className={`chip ${move >= 0 ? "gain" : "loss"}`}>{formatPercent(move)}</span>
        </div>
      </div>
      <div className="holdings-preview">
        {holdings.slice(0, 3).map((h) => (
          <Link key={h.ticker} href={`/asset/${h.ticker}`} data-sym={h.ticker}>
            <span className="flex items-center gap-1.5 font-mono text-xs font-semibold">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: fillFor(getTickerInfo(h.ticker).color, h.ticker) }} />
              {h.ticker}
            </span>
            <span className="mt-1 font-mono text-sm">
              {h.allocationPct.toFixed(0)}
              <span className="text-xs text-muted">%</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4">
        <span className="text-xs text-muted">
          <span className="font-mono">{holdings.length}</span> {holdings.length === 1 ? "position" : "positions"} ·{" "}
          {investor.kind === "wallet" ? "Live on-chain" : "Sample portfolio"}
        </span>
        <Link href={`/investor/${investor.id}`} className="text-sm font-semibold text-link">
          View portfolio <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </article>
  );
}
