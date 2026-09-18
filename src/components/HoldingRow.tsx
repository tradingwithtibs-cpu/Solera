import Link from "next/link";
import { getTickerInfo } from "@/lib/catalog";
import { formatCurrency, formatPercent, formatShares } from "@/lib/format";
import type { HoldingWithValue } from "@/lib/portfolio";
import { TickerBadge } from "./TickerBadge";
import { OwnedPumpingBadge } from "./OwnedPumpingBadge";
export function HoldingRow({
  holding,
  actions,
}: {
  holding: HoldingWithValue;
  actions?: { label: string; href: string }[];
}) {
  const info = getTickerInfo(holding.ticker);
  return (
    <div className="holding-row">
      <div className="flex items-center gap-3">
        <Link href={`/asset/${holding.ticker}`} className="flex min-w-0 flex-1 items-center gap-3">
          <TickerBadge ticker={info} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{holding.ticker}</p>
            <p className="truncate text-xs text-neutral-500">{info.name}</p>
          </div>
        </Link>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-semibold">{formatCurrency(holding.value)}</p>
          <p className="mt-1 text-xs text-neutral-500">
            <span className="font-mono">{formatShares(holding.shares)}</span> shares
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="text-neutral-500">
          <span className="font-mono">{holding.allocationPct.toFixed(1)}%</span> allocation
        </span>
        {holding.gainPct !== undefined && (
          <span className={`font-mono ${holding.gainPct >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {formatPercent(holding.gainPct)} return
          </span>
        )}
        {holding.allocationPct > 50 && <span className="text-amber-800">⚠ Concentrated</span>}
        <OwnedPumpingBadge ticker={holding.ticker} />
      </div>
      {holding.thesis && (
        <p className="mt-3 border-l-2 border-violet-200 pl-3 text-sm leading-relaxed text-neutral-600">
          “{holding.thesis}”
        </p>
      )}
      {actions && (
        <div className="mt-3 flex justify-end gap-2">
          {actions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="btn-secondary"
              aria-label={`${action.label} ${holding.ticker}`}
            >
              {action.label}
              {action.label === "Copy" ? " holding ↗" : ""}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
