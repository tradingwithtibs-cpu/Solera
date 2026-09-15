import type { TickerInfo } from "@/lib/types";

const SIZES = {
  sm: "h-9 w-9 text-[11px]",
  lg: "h-12 w-12 text-sm",
} as const;

/** Circular colored badge showing a ticker's short code (e.g. "TSLA" from "TSLAx"). */
export function TickerBadge({ ticker, size = "sm" }: { ticker: TickerInfo; size?: keyof typeof SIZES }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${SIZES[size]} ${ticker.color}`}
    >
      {ticker.symbol.replace("x", "")}
    </span>
  );
}
