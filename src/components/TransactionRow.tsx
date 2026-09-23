"use client";
import { getTickerInfo } from "@/lib/catalog";
import { useInvestor } from "@/hooks/use-investors";
import { formatCurrency, formatRelativeTime, formatShares } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { TickerBadge } from "./TickerBadge";
import { solscanTxUrl } from "@/lib/jupiter";

/**
 * One fill: side and size, when and at what, the practice / on-chain chip
 * (on-chain links to Solscan), how it was placed, and the note it carried.
 */
export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const ticker = getTickerInfo(transaction.ticker);
  const side = transaction.side ?? "buy"; // older logged transactions predate sell support
  const copiedFrom = useInvestor(transaction.copiedFromInvestorId);

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-b border-line-soft py-3 last:border-b-0">
      <TickerBadge ticker={ticker} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-fg">
          {side === "buy" ? "Bought" : "Sold"}{" "}
          <span className="font-mono">
            {formatShares(transaction.quantity)} {transaction.ticker}
          </span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          <span className="font-mono">
            {formatRelativeTime(transaction.timestamp)} · at {formatCurrency(transaction.pricePerShare)}
          </span>
          {copiedFrom && <span className="text-accent-text">copied from {copiedFrom.name}</span>}
          {transaction.signature ? (
            <a href={solscanTxUrl(transaction.signature)} target="_blank" rel="noreferrer" className="chip live">
              on-chain ↗
            </a>
          ) : (
            <span className="chip practice">practice</span>
          )}
          {transaction.via === "plan" && <span className="chip mark">via plan</span>}
          {transaction.via === "agent" && <span className="chip mark">via agent</span>}
        </p>
        {transaction.note && <blockquote className="mt-2 border-l-2 border-era-2 pl-3 text-[12px] leading-relaxed text-fg">“{transaction.note}”</blockquote>}
        {transaction.wrongIf && (
          <p className="mt-1 text-[11px] text-muted">
            <span className="eyebrow">Wrong if</span> {transaction.wrongIf}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right font-mono tabular-nums">
        <p className={`text-[13px] font-semibold ${side === "sell" ? "text-gain" : "text-fg"}`}>
          {side === "sell" ? "+" : ""}
          {formatCurrency(transaction.totalValue)}
        </p>
        <p className="text-[11px] text-muted">{formatShares(transaction.quantity)} shares</p>
      </div>
    </div>
  );
}
