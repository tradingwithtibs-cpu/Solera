"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Panel } from "@/components/panels/Panel";
import { TICKER_LIST } from "@/lib/mock-data";
import { computeTrendingTickers } from "@/lib/portfolio";
import { getCatalogToken, isFeatured, THIN_LIQUIDITY_USD } from "@/lib/catalog";
import {
  getChange24h,
  getEffectiveHistory,
  getEffectivePrice,
  getLivePrices,
  isLiveHistory,
  isLivePriced,
  subscribeLivePrices,
} from "@/lib/live-prices";
import { formatCurrency } from "@/lib/format";
import { COMPANIES, formatCompactUsd, type PreIpoToken } from "@/lib/pre-ipo";
import { useCatalog } from "@/hooks/use-catalog";
import { useInvestors } from "@/hooks/use-investors";
import { usePreIpo } from "@/hooks/use-pre-ipo";
import { useWatchlist } from "@/hooks/use-watchlist";
import { useMediaQuery } from "@/hooks/use-media";
import { WatchlistStarButton } from "@/components/WatchlistStarButton";
import { PreIpoBuySheet } from "@/components/PreIpoBuySheet";
import { SearchIcon } from "@/components/icons";
import { Sparkline } from "./Sparkline";
import type { MarketTab } from "./types";

type SortKey = "community" | "change" | "name" | "liquidity";

const PAGE = 30;
const FIRST_PAGE = 48;
const TABS: { value: MarketTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "xstocks", label: "xStocks" },
  { value: "preipo", label: "Pre-IPO" },
  { value: "watchlist", label: "Watchlist" },
];

interface Row {
  key: string;
  symbol: string;
  name: string;
  sub: string;
  price?: number;
  change?: number;
  live: boolean;
  spark: number[] | null;
  liquidity?: number;
  trailing: React.ReactNode;
  preIpo?: PreIpoToken;
  /** Dollars held by the tracked wallets: the "community holdings" sort key. */
  held: number;
  implied?: number;
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
}

function compare(sort: SortKey) {
  return (a: Row, b: Row): number => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "change":
        return (b.change ?? -Infinity) - (a.change ?? -Infinity) || a.name.localeCompare(b.name);
      case "liquidity":
        return (b.liquidity ?? -1) - (a.liquidity ?? -1);
      default:
        return b.held - a.held || (b.implied ?? b.liquidity ?? 0) - (a.implied ?? a.liquidity ?? 0);
    }
  };
}

interface Props {
  id: string;
  /** The symbol shown in the asset card; its row is highlighted. */
  selected: string;
  /** Desktop: a row click selects. Phones navigate (xStocks) or open the buy sheet (pre-IPO) instead. */
  onSelect: (symbol: string) => void;
  initialTab?: MarketTab;
  title?: string;
}

/**
 * The Markets list: the featured eight, the pre-IPO tokens and the whole
 * tokenized-stock catalog as dense rows with a sparkline, the live price,
 * Jupiter's 24h move and the liquidity or gap chip. Tabs, search and sort
 * live in a sticky toolbar; the body scrolls inside the sized card.
 */
export function MarketsCard({ id, selected, onSelect, initialTab = "all", title = "Markets" }: Props) {
  const [tab, setTab] = useState<MarketTab>(initialTab);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("community");
  const [limit, setLimit] = useState(FIRST_PAGE);
  const [sheetToken, setSheetToken] = useState<PreIpoToken | null>(null);
  const { tokens, isLoaded: catalogLoaded } = useCatalog();
  const { tokens: preIpoTokens, sources, isLoaded: preIpoLoaded } = usePreIpo();
  const { investors } = useInvestors();
  const { isWatched } = useWatchlist();
  const isPhone = useMediaQuery("(max-width: 767px)");
  // One subscription for the whole list: every row reads the store directly.
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);

  const held = new Map(computeTrendingTickers(investors).map((t) => [t.ticker, t.totalValue]));

  const featured: Row[] = TICKER_LIST.map((t) => {
    const liq = getCatalogToken(t.symbol)?.liquidityUsd;
    return {
      key: t.symbol,
      symbol: t.symbol,
      name: t.name,
      sub: `${t.name} · xStocks (Backed)`,
      // The placeholder price never prints: a featured row reads "—" until Jupiter has answered.
      price: isLivePriced(t.symbol) ? getEffectivePrice(t.symbol) : undefined,
      change: getChange24h(t.symbol),
      live: isLivePriced(t.symbol),
      spark: isLiveHistory(t.symbol) ? getEffectiveHistory(t.symbol) : null,
      liquidity: liq,
      trailing: <span className={`liq ${liq === undefined ? "off" : ""}`}>{liq === undefined ? "— liq" : `${formatCompactUsd(liq)} liq`}</span>,
      held: held.get(t.symbol) ?? 0,
    };
  });

  const catalog: Row[] = tokens
    .filter((t) => !isFeatured(t.symbol))
    .map((t) => {
      const thin = t.liquidityUsd !== undefined && t.liquidityUsd < THIN_LIQUIDITY_USD;
      return {
        key: t.mint,
        symbol: t.symbol,
        name: t.name,
        sub: `${t.name} · xStocks (Backed)`,
        price: t.usdPrice,
        change: t.change24hPct,
        live: !!t.usdPrice,
        spark: null,
        liquidity: t.liquidityUsd,
        trailing: !t.usdPrice ? (
          <span className="chip">Not yet trading</span>
        ) : t.liquidityUsd !== undefined ? (
          <span className={`liq ${thin ? "thin" : ""}`}>
            {formatCompactUsd(t.liquidityUsd)} liq{thin ? " · thin" : ""}
          </span>
        ) : (
          <span className="liq off">— liq</span>
        ),
        held: held.get(t.symbol) ?? 0,
      };
    });

  const preIpo: Row[] = preIpoTokens.map((t) => {
    const company = COMPANIES[t.company];
    return {
      key: t.mint,
      symbol: t.symbol,
      name: company.name,
      sub: `${company.name} · ${t.issuer} · mark ${formatCurrency(t.markPrice)}`,
      price: t.tokenPrice,
      change: t.change24hPct,
      live: t.tokenPrice > 0,
      spark: null,
      liquidity: t.liquidityUsd,
      trailing: Number.isFinite(t.premiumPct) ? (
        <span className={`gap ${t.premiumPct >= 0 ? "up" : "down"}`}>
          {pct(t.premiumPct)} <span className="gap-word">vs mark</span>
        </span>
      ) : (
        <span className="liq off">— vs mark</span>
      ),
      preIpo: t,
      held: 0,
      implied: Number.isFinite(t.impliedValuation) ? t.impliedValuation : undefined,
    };
  });

  const q = query.trim().toLowerCase();
  const matches = (r: Row) => !q || r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
  // Hundreds of xStocks are minted with no market yet: they stay out of the browse list but a search still finds them.
  const browsable = (r: Row) => matches(r) && (!!q || r.live);
  const watched = (r: Row) => matches(r) && isWatched(r.symbol);
  const groups: Row[][] =
    tab === "all"
      ? [featured.filter(matches), preIpo.filter(matches), catalog.filter(browsable)]
      : tab === "xstocks"
        ? [featured.filter(matches), catalog.filter(browsable)]
        : tab === "preipo"
          ? [preIpo.filter(matches)]
          : [featured.filter(watched), preIpo.filter(watched), catalog.filter(watched)];
  const by = compare(sort);
  const rows = groups.flatMap((g) => [...g].sort(by));
  const visible = rows.slice(0, limit);
  const catalogPending = !catalogLoaded && tab !== "preipo" && !q;
  const tradeable = tokens.filter((t) => t.usdPrice).length;

  const subtitle =
    tab === "preipo" && preIpoLoaded
      ? `${preIpoTokens.length} tokens${sources && !sources.tessera ? " · Tessera feed offline" : ""}${sources && !sources.prestocks ? " · PreStocks feed offline" : ""}`
      : undefined;

  return (
    <Panel
      id={id}
      title={title}
      subtitle={subtitle}
      bodyClassName="p-0"
      foot={catalogLoaded ? `prices live via Jupiter Price v3 · ${tradeable.toLocaleString()} of ${tokens.length.toLocaleString()} tokenized stocks trading` : "loading catalog…"}
    >
      <div className="mk-toolbar">
        <div className="seg" role="group" aria-label="Market view">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={tab === t.value}
              onClick={() => {
                setTab(t.value);
                setLimit(FIRST_PAGE);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mk-toolbar-row">
          <label className="search-field">
            <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
            <input
              type="search"
              aria-label="Search markets"
              placeholder="Search markets"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(FIRST_PAGE);
              }}
            />
          </label>
          <select aria-label="Sort markets" className="mk-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="community">Most held</option>
            <option value="change">24h change</option>
            <option value="name">Name</option>
            <option value="liquidity">Liquidity</option>
          </select>
        </div>
      </div>

      {visible.length === 0 && !catalogPending ? (
        <div className="empty-state mk-empty">
          {q ? (
            <>
              <h2>No matching assets.</h2>
              <p>Try another company or ticker.</p>
            </>
          ) : tab === "watchlist" ? (
            <>
              <h2>Keep a few on your radar.</h2>
              <p>Tap the star beside a stock to save it to your watchlist.</p>
            </>
          ) : tab === "preipo" && !preIpoLoaded ? (
            <p aria-busy="true">Reading the issuer feeds…</p>
          ) : (
            <p>Nothing to show yet.</p>
          )}
          {(q || tab === "watchlist") && (
            <button
              type="button"
              className="btn-secondary btn-small mt-4"
              onClick={() => {
                setQuery("");
                setTab("all");
              }}
            >
              Browse all markets
            </button>
          )}
        </div>
      ) : (
        <div className="rows mk-rows">
          {visible.map((row) => (
            <MarketRowView
              key={row.key}
              row={row}
              selected={row.symbol === selected}
              isPhone={isPhone}
              onSelect={onSelect}
              onPreIpoTap={setSheetToken}
            />
          ))}
        </div>
      )}

      {catalogPending && (
        <div className="mk-skeleton" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      )}
      {rows.length > visible.length && (
        <button type="button" className="btn-secondary btn-small mk-more" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, rows.length - visible.length)} more
        </button>
      )}
      {sheetToken && <PreIpoBuySheet token={sheetToken} onClose={() => setSheetToken(null)} />}
    </Panel>
  );
}

function MarketRowView({
  row,
  selected,
  isPhone,
  onSelect,
  onPreIpoTap,
}: {
  row: Row;
  selected: boolean;
  isPhone: boolean;
  onSelect: (symbol: string) => void;
  onPreIpoTap: (token: PreIpoToken) => void;
}) {
  const main = (
    <>
      <b>
        {row.symbol}
        {row.preIpo && <span className="chip mark">{row.preIpo.issuer}</span>}
        {row.live && (
          <i className="live-tag" title="Live from Jupiter" aria-label="live">
            ●
          </i>
        )}
      </b>
      <small>{row.sub}</small>
    </>
  );
  return (
    <div className={`row ${selected ? "on" : ""}`} data-sym={row.symbol}>
      {row.preIpo ? (
        <button
          type="button"
          className="row-main"
          aria-pressed={selected}
          onClick={() => (isPhone ? onPreIpoTap(row.preIpo!) : onSelect(row.symbol))}
        >
          {main}
        </button>
      ) : (
        <Link
          href={`/asset/${row.symbol}`}
          className="row-main"
          aria-current={selected ? "true" : undefined}
          onClick={(e) => {
            if (isPhone) return;
            e.preventDefault();
            onSelect(row.symbol);
          }}
        >
          {main}
        </Link>
      )}
      <Sparkline series={row.spark ?? []} />
      <span className="row-num">
        <b>{row.price ? formatCurrency(row.price) : "—"}</b>
        <small className={row.change === undefined ? "" : row.change >= 0 ? "up" : "down"}>
          {row.change === undefined ? "— 24h" : `${pct(row.change)} 24h`}
        </small>
      </span>
      {row.trailing}
      <WatchlistStarButton ticker={row.symbol} />
    </div>
  );
}
