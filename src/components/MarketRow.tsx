import Link from "next/link";
import type { TickerInfo } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import { TickerBadge } from "./TickerBadge";
import { PremiumBadge } from "./PremiumBadge";

/**
 * A row for the "Markets" list — a ticker the user may not hold yet, with a
 * Buy action. No Pumping badge here on purpose: that badge is a personal
 * "your position is heating up" signal, and this row is by definition a
 * ticker the user doesn't hold yet.
 */
export function MarketRow({ ticker }: { ticker: TickerInfo }) {
  const { price, isLive } = useEffectivePrice(ticker.symbol);
  return (
    <div className="flex items-center gap-3 py-4">
      <Link href={`/asset/${ticker.symbol}`} className="flex min-w-0 flex-1 items-center gap-3">
        <TickerBadge ticker={ticker} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">{ticker.symbol}</p>
          <p className="text-xs text-neutral-400">{ticker.name}</p>
        </div>
      </Link>
      <p className="shrink-0 text-right">
        <span className="block font-mono text-sm font-semibold tabular-nums text-neutral-900">
          {formatCurrency(price)}
        </span>
        {isLive && <span className="block text-[10px] font-medium text-emerald-600">Live</span>}
        <PremiumBadge ticker={ticker.symbol} compact />
      </p>
      <Link
        href={`/buy/${ticker.symbol}`}
        className="ml-1 shrink-0 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-600 active:bg-violet-100"
      >
        Buy
      </Link>
    </div>
  );
}
