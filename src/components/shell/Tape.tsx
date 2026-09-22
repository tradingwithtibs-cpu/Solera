"use client";

import { useSyncExternalStore } from "react";
import { XSTOCK_TOKENS } from "@/lib/tokens";
import { getChange24h, getEffectivePrice, getLivePrices, isLivePriced, subscribeLivePrices } from "@/lib/live-prices";
import { usePreIpo } from "@/hooks/use-pre-ipo";
import { formatCurrency } from "@/lib/format";
import type { TickerSymbol } from "@/lib/types";

interface Item {
  symbol: string;
  price?: number;
  change?: number;
}

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/**
 * The ticker tape: the eight featured xStocks at their live Solana price,
 * then the PreStocks tokens. Nothing renders a number until a real one
 * exists; before that a symbol shows "—". Duplicated once so the crawl
 * loops; hidden from assistive tech because Markets carries the same data.
 */
export function Tape() {
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  const { tokens } = usePreIpo();

  const featured: Item[] = (Object.keys(XSTOCK_TOKENS) as TickerSymbol[]).map((symbol) => ({
    symbol,
    price: isLivePriced(symbol) ? getEffectivePrice(symbol) : undefined,
    change: getChange24h(symbol),
  }));
  const preIpo: Item[] = tokens
    .filter((t) => String(t.issuer).toLowerCase() === "prestocks" && t.tokenPrice > 0)
    .map((t) => ({ symbol: t.symbol, price: t.tokenPrice, change: t.change24hPct }));
  const items = [...featured, ...preIpo];
  const loop = [...items, ...items];

  return (
    <div className="tape" aria-hidden="true">
      <div className="tape-track">
        {loop.map((it, i) => (
          <span key={`${it.symbol}-${i}`}>
            <b>{it.symbol}</b>
            <i>{it.price !== undefined ? formatCurrency(it.price) : "—"}</i>
            {it.change !== undefined && <em className={it.change >= 0 ? "up" : "down"}>{pct(it.change)}</em>}
          </span>
        ))}
      </div>
    </div>
  );
}
