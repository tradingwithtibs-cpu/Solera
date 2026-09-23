import { getTickerInfo } from "@/lib/catalog";
import { fillFor } from "@/lib/palette";
import type { HoldingWithValue } from "@/lib/portfolio";

/** A segmented bar giving a one-glance read of the holdings mix, in the ticker fills, with an optional legend. */
export function AllocationBar({ holdings, legend = false }: { holdings: HoldingWithValue[]; legend?: boolean }) {
  if (holdings.length === 0) return null;
  const fills = holdings.map((h) => ({ ...h, fill: fillFor(getTickerInfo(h.ticker).color, h.ticker) }));

  return (
    <div>
      <div
        className="flex h-1.5 w-full overflow-hidden bg-line"
        role="img"
        aria-label={`Allocation: ${fills.map((h) => `${h.ticker} ${h.allocationPct.toFixed(0)}%`).join(", ")}`}
      >
        {fills.map((h) => (
          <div key={h.ticker} style={{ width: `${h.allocationPct}%`, background: h.fill }} title={`${h.ticker} · ${h.allocationPct.toFixed(0)}%`} />
        ))}
      </div>
      {legend && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted" aria-hidden="true">
          {fills.map((h) => (
            <li key={h.ticker} className="flex items-center gap-1.5">
              <i className="inline-block h-2 w-2 rounded-[3px]" style={{ background: h.fill }} />
              {h.ticker} {h.allocationPct.toFixed(0)}%
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
