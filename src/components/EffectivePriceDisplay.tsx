"use client";

import { formatCurrency } from "@/lib/format";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import type { TickerSymbol } from "@/lib/types";

/**
 * The headline price on the asset page — live for AAPLx/AMZNx,
 * simulated for everything else. A tiny client island inside an otherwise
 * server-rendered page, since the live price needs to update in the
 * browser without a full page reload.
 */
export function EffectivePriceDisplay({ ticker }: { ticker: TickerSymbol }) {
  const { price, isLive } = useEffectivePrice(ticker);
  return (
    <p className="font-mono text-2xl font-semibold tabular-nums text-neutral-900">
      {formatCurrency(price)}
      {isLive && <span className="ml-2 align-middle text-xs font-semibold text-emerald-600">Live</span>}
    </p>
  );
}
