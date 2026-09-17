"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { TICKER_LIST } from "@/lib/mock-data";
import { computeTrendingTickers, tickerChangePct } from "@/lib/portfolio";
import { getEffectivePrice, getLivePrices, isLivePriced, subscribeLivePrices } from "@/lib/live-prices";
import { formatCurrency } from "@/lib/format";
import { useWatchlist } from "@/hooks/use-watchlist";
import { TickerBadge } from "@/components/TickerBadge";
import { PriceChart } from "@/components/PriceChart";
import { OwnedPumpingBadge } from "@/components/OwnedPumpingBadge";
import { WatchlistStarButton } from "@/components/WatchlistStarButton";
import { PerformanceBadge } from "@/components/PerformanceBadge";
import { PremiumBadge } from "@/components/PremiumBadge";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SearchIcon } from "@/components/icons";
export default function MarketsPage() {
  const [view, setView] = useState<"all" | "watchlist">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("community");
  const { isWatched } = useWatchlist();
  // Subscribed once here (rather than per-row via a hook, which the .map()
  // below can't do) so the whole list re-renders when a live price updates;
  // getEffectivePrice/isLivePriced are then just plain reads per ticker.
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  const totals = new Map(computeTrendingTickers().map((t) => [t.ticker, t]));
  const q = query.trim().toLowerCase();
  const visible = TICKER_LIST.filter(
    (t) =>
      (view === "all" || isWatched(t.symbol)) && (!q || `${t.name} ${t.symbol}`.toLowerCase().includes(q)),
  ).sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "change"
        ? tickerChangePct(b.symbol) - tickerChangePct(a.symbol)
        : (totals.get(b.symbol)?.totalValue ?? 0) - (totals.get(a.symbol)?.totalValue ?? 0),
  );
  return (
    <div className="flex flex-1 flex-col">
      <header className="page-heading">
        <p className="eyebrow">Own a little of what’s next</p>
        <h1>
          Markets<span className="text-violet-500">.</span>
        </h1>
        <p>Familiar companies. A new way to explore them.</p>
      </header>
      <div className="space-y-4 px-5 pb-5 sm:px-7">
        <div className="search-field">
          <SearchIcon className="h-4 w-4 text-neutral-500" />
          <input
            type="search"
            aria-label="Search markets"
            placeholder="Search companies or tickers"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <SegmentedControl
          label="Market view"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "All markets" },
            { value: "watchlist", label: "Watchlist" },
          ]}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-neutral-500" aria-live="polite">
            <span className="font-mono">{visible.length}</span> {visible.length === 1 ? "asset" : "assets"} ·
            Simulated data
          </span>
          <select
            aria-label="Sort markets"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs"
          >
            <option value="community">Community holdings</option>
            <option value="change">Price change</option>
            <option value="name">Company name</option>
          </select>
        </div>
      </div>
      <div className="flex-1 px-5 pb-7 sm:px-7">
        {!visible.length ? (
          <div className="empty-state">
            <h2>{query ? "No matching assets." : "Keep a few on your radar."}</h2>
            <p>
              {query
                ? "Try another company or ticker."
                : "Tap the star beside a stock to save it to your watchlist."}
            </p>
            <button
              className="btn-secondary mt-4"
              onClick={() => {
                setQuery("");
                setView("all");
              }}
            >
              Browse all markets
            </button>
          </div>
        ) : (
          <div className="market-list">
            {visible.map((ticker) => (
              <article key={ticker.symbol} className="market-item">
                <Link href={`/asset/${ticker.symbol}`} className="market-main">
                  <TickerBadge ticker={ticker} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold">{ticker.symbol}</h2>
                    <p className="truncate text-xs text-neutral-500">{ticker.name}</p>
                  </div>
                  <div className="market-spark">
                    <PriceChart history={ticker.history} color={ticker.color} />
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="mb-1 font-mono text-sm font-semibold">
                      {formatCurrency(getEffectivePrice(ticker.symbol))}
                    </p>
                    {isLivePriced(ticker.symbol) && (
                      <p className="mb-1 text-[10px] font-medium text-emerald-600">
                        Live <PremiumBadge ticker={ticker.symbol} compact />
                      </p>
                    )}
                    <PerformanceBadge value={tickerChangePct(ticker.symbol)} />
                  </div>
                </Link>
                <WatchlistStarButton ticker={ticker.symbol} />
                <div className="market-meta">
                  <span>
                    {totals.get(ticker.symbol)?.holderCount ?? 0} sample{" "}
                    {totals.get(ticker.symbol)?.holderCount === 1 ? "investor" : "investors"} ·{" "}
                    <span className="font-mono">
                      {formatCurrency(totals.get(ticker.symbol)?.totalValue ?? 0)}
                    </span>{" "}
                    held
                  </span>
                  <OwnedPumpingBadge ticker={ticker.symbol} />
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-neutral-500">
          Price changes cover each asset’s simulated trailing period.
        </p>
      </div>
    </div>
  );
}
