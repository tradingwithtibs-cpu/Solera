import type { TickerInfo } from "@/lib/types";
import { fillFor } from "@/lib/palette";

const SIZES = {
  sm: "h-9 w-9 text-[11px]",
  lg: "h-12 w-12 text-sm",
} as const;

/** Circular colored badge showing a ticker's short code (e.g. "TSLA" from "TSLAx"). */
export function TickerBadge({ ticker, size = "sm" }: { ticker: TickerInfo; size?: keyof typeof SIZES }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border border-line-strong font-mono font-semibold text-white ${SIZES[size]}`}
      style={{ background: fillFor(ticker.color, ticker.symbol) }}
    >
      {ticker.symbol.replace(/x$/, "")}
    </span>
  );
}
