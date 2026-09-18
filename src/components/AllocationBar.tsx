import { getTickerInfo } from "@/lib/catalog";
import type { HoldingWithValue } from "@/lib/portfolio";

/** A segmented bar giving a one-glance read of holdings mix, in ticker colors. */
export function AllocationBar({ holdings }: { holdings: HoldingWithValue[] }) {
  if (holdings.length === 0) return null;

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-neutral-100">
      {holdings.map((h) => (
        <div
          key={h.ticker}
          className={getTickerInfo(h.ticker).color}
          style={{ width: `${h.allocationPct}%` }}
          title={`${h.ticker} · ${h.allocationPct.toFixed(0)}%`}
        />
      ))}
    </div>
  );
}
