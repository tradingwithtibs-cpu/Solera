import { getTickerInfo } from "@/lib/catalog";
import { fillFor } from "@/lib/palette";
import type { HoldingWithValue } from "@/lib/portfolio";

/**
 * The 6px allocation bar (design-system §4.10) in the ticker fills: one
 * segment per holding, widest first, plus a legend. Fills are the `--tk-n`
 * tokens, set as a style so nothing depends on a palette class name.
 */
export function AllocationStrip({ holdings }: { holdings: HoldingWithValue[] }) {
  if (holdings.length === 0) return null;
  return (
    <div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-line" role="img" aria-label="Allocation by holding">
        {holdings.map((h) => (
          <div
            key={h.ticker}
            style={{ width: `${h.allocationPct}%`, background: fillFor(getTickerInfo(h.ticker).color, h.ticker) }}
            title={`${h.ticker} · ${h.allocationPct.toFixed(0)}%`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {holdings.map((h) => (
          <li key={h.ticker} className="flex items-center gap-1.5" data-sym={h.ticker}>
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: fillFor(getTickerInfo(h.ticker).color, h.ticker) }} aria-hidden="true" />
            <span className="font-mono">{h.ticker}</span> {h.allocationPct.toFixed(0)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
