"use client";

import { useState } from "react";
import Link from "next/link";
import { useCatalog } from "@/hooks/use-catalog";
import { getTickerInfo, isFeatured, THIN_LIQUIDITY_USD } from "@/lib/catalog";
import { formatCurrency } from "@/lib/format";
import { formatCompactUsd } from "@/lib/pre-ipo";
import { TickerBadge } from "./TickerBadge";
import { PerformanceBadge } from "./PerformanceBadge";
import { WatchlistStarButton } from "./WatchlistStarButton";

const PAGE = 30;

/**
 * Every tokenized stock on Solana beyond the featured eight, most liquid
 * first, searchable by ticker or company. Prices are Jupiter's hourly
 * snapshot here; opening one starts live polling. Thin markets are flagged
 * so nobody is surprised by slippage on a $5 buy of an obscure listing.
 */
export function CatalogList({ query, watchlistOnly, isWatched }: { query: string; watchlistOnly: boolean; isWatched: (s: string) => boolean }) {
  const { tokens, isLoaded } = useCatalog();
  const [limit, setLimit] = useState(PAGE);
  const q = query.trim().toLowerCase();

  // Hundreds of xStocks exist on-chain with no market yet. They stay out of
  // the browse list (nothing to buy) but a search still finds them, labelled.
  const matches = tokens.filter(
    (t) =>
      !isFeatured(t.symbol) &&
      (!watchlistOnly || isWatched(t.symbol)) &&
      (q ? t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) : !!t.usdPrice),
  );
  const tradeable = tokens.filter((t) => !isFeatured(t.symbol) && t.usdPrice).length;
  const visible = matches.slice(0, limit);

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">All tokenized stocks</h2>
        <span className="text-xs text-neutral-400">
          {isLoaded
            ? q
              ? `${matches.length.toLocaleString()} matches`
              : `${tradeable.toLocaleString()} trading · ${(tokens.length - tradeable - 8).toLocaleString()} more minted, not yet trading`
            : "Loading catalog…"}
        </span>
      </div>
      {!isLoaded ? (
        <div className="mt-3 space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-neutral-100" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">No other tokenized stocks match.</p>
      ) : (
        <div className="market-list mt-3">
          {visible.map((t) => {
            const info = getTickerInfo(t.symbol);
            const thin = (t.liquidityUsd ?? 0) < THIN_LIQUIDITY_USD;
            return (
              <article key={t.symbol} className="market-item">
                <Link href={`/asset/${t.symbol}`} className="market-main">
                  <TickerBadge ticker={info} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">{t.symbol}</h3>
                    <p className="truncate text-xs text-neutral-500">{t.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="mb-1 font-mono text-sm font-semibold">{t.usdPrice ? formatCurrency(t.usdPrice) : "—"}</p>
                    {t.change24hPct !== undefined && <PerformanceBadge value={t.change24hPct} />}
                  </div>
                </Link>
                <WatchlistStarButton ticker={t.symbol} />
                <div className="market-meta">
                  <span>
                    {!t.usdPrice ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">Not yet trading</span>
                    ) : t.liquidityUsd !== undefined ? (
                      <>
                        <span className="font-mono">{formatCompactUsd(t.liquidityUsd)}</span> liquidity
                        {thin && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Thin market</span>}
                      </>
                    ) : (
                      "No pool data"
                    )}
                  </span>
                  <span className="text-[10px] text-neutral-400">24h change</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {isLoaded && matches.length > visible.length && (
        <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="btn-secondary mt-4 w-full">
          Show {Math.min(PAGE, matches.length - visible.length)} more
        </button>
      )}
    </section>
  );
}
