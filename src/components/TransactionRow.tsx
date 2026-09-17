import { INVESTORS, TICKERS } from "@/lib/mock-data";
import { formatCurrency, formatRelativeTime, formatShares } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { TickerBadge } from "./TickerBadge";
import { solscanTxUrl } from "@/lib/jupiter";

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const ticker = TICKERS[transaction.ticker];
  const side = transaction.side ?? "buy"; // older logged transactions predate sell support
  const copiedFrom = transaction.copiedFromInvestorId
    ? INVESTORS.find((i) => i.id === transaction.copiedFromInvestorId)
    : undefined;

  return (
    <div className="flex items-center gap-3 py-4">
      <TickerBadge ticker={ticker} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900">
          {side === "buy" ? "Bought" : "Sold"} {transaction.ticker}
        </p>
        <p className="truncate text-xs text-neutral-400">
          {copiedFrom && <span className="text-violet-500">Copied from {copiedFrom.name} · </span>}
          {formatRelativeTime(transaction.timestamp)}
          {transaction.signature && (
            <>
              {" · "}
              <a
                href={solscanTxUrl(transaction.signature)}
                target="_blank"
                rel="noreferrer"
                className="text-violet-500 underline"
              >
                on-chain ↗
              </a>
            </>
          )}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`font-mono text-sm font-semibold tabular-nums ${
            side === "buy" ? "text-neutral-900" : "text-emerald-600"
          }`}
        >
          {side === "sell" ? "+" : ""}
          {formatCurrency(transaction.totalValue)}
        </p>
        <p className="font-mono text-xs text-neutral-400">{formatShares(transaction.quantity)} shares</p>
      </div>
    </div>
  );
}
