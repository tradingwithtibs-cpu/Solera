"use client";

import { useState, useSyncExternalStore, useMemo } from "react";
import Link from "next/link";
import { Panel } from "@/components/panels/Panel";
import { RangeSwitch, rangeCaption } from "@/components/ui/RangeSwitch";
import { BigChart } from "@/components/ui/BigChart";
import { TickerBadge } from "@/components/TickerBadge";
import { OwnedPumpingBadge } from "@/components/OwnedPumpingBadge";
import { WatchlistStarButton } from "@/components/WatchlistStarButton";
import { EffectivePriceDisplay } from "@/components/EffectivePriceDisplay";
import { NewsList } from "@/components/NewsList";
import { getCatalogToken, getTickerInfo, getTokenForSymbol, isFeatured, isKnownTicker, THIN_LIQUIDITY_USD } from "@/lib/catalog";
import { getEffectiveHistory, getLivePrices, isLiveHistory, subscribeLivePrices, type HistoryWindow } from "@/lib/live-prices";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import { useHistoryRange } from "@/hooks/use-history-range";
import { useLivePriceFor } from "@/hooks/use-live-price-for";
import { useCatalog } from "@/hooks/use-catalog";
import { usePreIpo } from "@/hooks/use-pre-ipo";
import { formatCurrency } from "@/lib/format";
import { COMPANIES, compareAcrossIssuers, formatCompactUsd, formatValuation, type PreIpoToken } from "@/lib/pre-ipo";
import { shortAddress } from "@/lib/investors";
import { fillFor } from "@/lib/palette";
import type { TickerSymbol } from "@/lib/types";
import { HeldBy } from "./HeldBy";
import { LiveRoomLink } from "./RoomLink";
import { TradeTicket } from "./TradeTicket";

const EMPTY_SERIES: number[] = [];
const CADENCE: Record<HistoryWindow, string> = { "24h": "5-minute", "7d": "6-hourly", "30d": "6-hourly", "180d": "daily" };

function pct(n: number, digits = 2): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}%`;
}

function solscan(mint: string): string {
  return `https://solscan.io/token/${mint}`;
}

function AskChips({ questions }: { questions: string[] }) {
  return (
    <section className="asset-section">
      <p className="eyebrow">Ask the agent</p>
      <div className="ask-chips">
        {questions.map((q) => (
          <Link key={q} href={`/agent?q=${encodeURIComponent(q)}`} className="ask-chip">
            {q}
          </Link>
        ))}
      </div>
    </section>
  );
}

interface Props {
  id: string;
  /** An xStock symbol, or a pre-IPO symbol or mint. */
  symbol: string;
  /** The phone's Trade tab: the room link beneath the body, because the room panel lives on the Markets tab. */
  phoneRoom?: boolean;
}

/**
 * The selected asset: head, chart with ranges, the facts row, agent
 * prompts, the real holders, news and the ticket beside the chart. Two
 * targets share the card: a tokenized stock and a pre-IPO token.
 */
export function AssetCard({ id, symbol, phoneRoom = false }: Props) {
  const { isLoaded: catalogLoaded } = useCatalog();
  const { tokens: preIpoTokens, isLoaded: preIpoLoaded } = usePreIpo();
  const xstock = isKnownTicker(symbol) && (isFeatured(symbol) || !!getCatalogToken(symbol));
  const preIpo = xstock ? undefined : preIpoTokens.find((t) => t.symbol === symbol || t.mint === symbol);
  useLivePriceFor(xstock ? symbol : undefined);

  if (xstock) return <XStockCard id={id} symbol={symbol} phoneRoom={phoneRoom} />;
  if (preIpo) return <PreIpoCard id={id} token={preIpo} all={preIpoTokens} />;
  const loading = !catalogLoaded || !preIpoLoaded;
  return (
    <Panel id={id} title={loading ? "Asset" : symbol}>
      {loading ? (
        <p className="asset-note" aria-busy="true">
          Loading the catalog…
        </p>
      ) : (
        <div className="empty-state">
          <h2>We couldn&apos;t find that asset.</h2>
          <p>Pick another one from Markets.</p>
        </div>
      )}
    </Panel>
  );
}

function XStockCard({ id, symbol, phoneRoom }: { id: string; symbol: TickerSymbol; phoneRoom: boolean }) {
  const info = getTickerInfo(symbol);
  const catalog = getCatalogToken(symbol);
  const featured = isFeatured(symbol);
  const mint = getTokenForSymbol(symbol)?.mint;
  const [range, setRange] = useState<HistoryWindow>("7d");
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  useHistoryRange([symbol], range);
  const { underlying, premiumPct } = useEffectivePrice(symbol);
  const live = isLiveHistory(symbol, range);
  // The 30d series is a stable store reference; the 7d slice is memoised so BigChart's effect doesn't re-arm on every price tick.
  const base = live ? getEffectiveHistory(symbol, range === "7d" ? "30d" : range) : EMPTY_SERIES;
  const history = useMemo(() => (range === "7d" ? base.slice(-Math.max(2, Math.round((base.length * 7) / 30))) : base), [base, range]);
  const liquidity = catalog?.liquidityUsd;
  const thin = !featured && (liquidity ?? 0) < THIN_LIQUIDITY_USD;
  const reference = underlying && !underlying.stale ? underlying.price : undefined;

  return (
    <Panel id={id} title={`${info.name} · ${symbol}`} tools={<WatchlistStarButton ticker={symbol} size="sm" />}>
      <div className="asset-head">
        <TickerBadge ticker={info} size="lg" />
        <div className="asset-title">
          <h3>
            {info.name} <small>{symbol}</small> <OwnedPumpingBadge ticker={symbol} />
          </h3>
          <p>
            xStocks (Backed)
            {mint && (
              <>
                {" · "}
                <a href={solscan(mint)} target="_blank" rel="noreferrer">
                  {shortAddress(mint)} ↗
                </a>
              </>
            )}
            {" · "}price-tracking token
          </p>
        </div>
        <EffectivePriceDisplay ticker={symbol} className="asset-price" />
      </div>

      <div className="asset-grid">
        <div className="asset-left">
          <div className="chart-bar">
            <span className="muted">
              {symbol} · {CADENCE[range]}
            </span>
            <RangeSwitch value={range} onChange={setRange} />
          </div>
          {history.length < 2 ? (
            <div className="chart-empty" aria-busy="true">
              {rangeCaption(range).split(" · ")[0]} chart loading…
            </div>
          ) : (
            <>
              <div className="chart-wrap">
                <BigChart series={history} range={range} reference={reference} ariaLabel={`${symbol} price, ${rangeCaption(range).toLowerCase()}`} />
              </div>
              <p className="chart-caption">{rangeCaption(range)} · Solana DEX price</p>
            </>
          )}

          <dl className="facts three">
            <div>
              <dt>Exchange reference</dt>
              <dd>
                {underlying ? formatCurrency(underlying.price) : "—"}
                <small>
                  {!featured
                    ? "not tracked for this token yet"
                    : !underlying
                      ? "waiting for the Pyth feed"
                      : underlying.stale
                        ? "NYSE closed · last regular-session print"
                        : "underlying, via Pyth"}
                </small>
              </dd>
            </div>
            <div>
              <dt>On-chain gap</dt>
              <dd>
                <span className={premiumPct === undefined ? "" : premiumPct > 0.05 ? "warn" : premiumPct < -0.05 ? "up" : ""}>
                  {premiumPct === undefined ? "—" : pct(premiumPct)}
                </span>
                <small>{!featured ? "no exchange reference for this token" : underlying?.stale ? "no reference while the exchange is closed" : "token price vs the stock"}</small>
              </dd>
            </div>
            <div>
              <dt>Liquidity</dt>
              <dd>
                <span className={thin ? "warn" : ""}>{liquidity !== undefined ? formatCompactUsd(liquidity) : "—"}</span>
                <small>{thin ? "thin market, expect slippage" : "Solana pools · no vote, dividends rebased"}</small>
              </dd>
            </div>
          </dl>

          <AskChips questions={[`Why did ${symbol} move today?`, `Who holds ${symbol}?`]} />

          <section className="asset-section">
            <p className="eyebrow">Held by</p>
            <HeldBy ticker={symbol} />
          </section>

          <section className="asset-section">
            <p className="eyebrow">{info.name} in the news</p>
            <div className="mt-1">
              <NewsList scope={{ kind: "ticker", ticker: symbol }} limit={3} />
            </div>
          </section>

          {phoneRoom && (
            <div className="room-link-wrap">
              <LiveRoomLink ticker={symbol} />
            </div>
          )}
        </div>

        <TradeTicket key={symbol} target={{ kind: "xstock", ticker: symbol }} compact />
      </div>
    </Panel>
  );
}

function PreIpoCard({ id, token, all }: { id: string; token: PreIpoToken; all: PreIpoToken[] }) {
  const company = COMPANIES[token.company];
  const comparison = compareAcrossIssuers(all).find((c) => c.company.id === token.company);
  const exposure = token.issuer === "Tessera" ? "loan participation rights, not shares" : "SPV exposure, not shares";
  const change = token.change24hPct;

  return (
    <Panel id={id} title={`${company.name} · ${token.symbol}`} tools={<WatchlistStarButton ticker={token.symbol} size="sm" />}>
      <div className="asset-head">
        <span className="avatar lg" style={{ background: fillFor(company.color, company.id) }} aria-hidden="true">
          {company.short}
        </span>
        <div className="asset-title">
          <h3>
            {company.name} <small>{token.symbol}</small>
          </h3>
          <p>
            {token.issuer} ·{" "}
            <a href={solscan(token.mint)} target="_blank" rel="noreferrer">
              {shortAddress(token.mint)} ↗
            </a>{" "}
            · {exposure}
          </p>
        </div>
        <div className="asset-price">
          <b>{formatCurrency(token.tokenPrice)}</b>
          {change !== undefined ? (
            <small className={change >= 0 ? "up" : "down"}>{pct(change, 1)} 24h</small>
          ) : (
            <small className="muted">— 24h</small>
          )}
          <span className="src">Live · Jupiter</span>
        </div>
      </div>

      <div className="asset-grid">
        <div className="asset-left">
          <div className="chart-empty">No price history source for {token.issuer} tokens yet.</div>

          <dl className="facts three">
            <div>
              <dt>Issuer mark</dt>
              <dd>
                {formatCurrency(token.markPrice)}
                <small>{token.issuer} fair value per token</small>
              </dd>
            </div>
            <div>
              <dt>Gap to mark</dt>
              <dd>
                <span className={!Number.isFinite(token.premiumPct) ? "" : token.premiumPct > 0.5 ? "warn" : token.premiumPct < -0.5 ? "up" : ""}>
                  {Number.isFinite(token.premiumPct) ? pct(token.premiumPct, 1) : "—"}
                </span>
                <small>
                  implies {formatValuation(token.impliedValuation)} vs {formatValuation(token.markValuation)} at the mark
                </small>
              </dd>
            </div>
            <div>
              <dt>Liquidity</dt>
              <dd>
                {token.liquidityUsd !== undefined ? formatCompactUsd(token.liquidityUsd) : "—"}
                <small>{token.issuer === "Tessera" ? "no vote, loan participation" : "no vote, SPV exposure"}</small>
              </dd>
            </div>
          </dl>

          {comparison && (
            <section className="asset-section">
              <p className="eyebrow">Same company, two issuers</p>
              <div className="compare-rows">
                {comparison.tokens.map((t) => (
                  <div key={t.mint} className={t === comparison.cheapest ? "on" : ""}>
                    <span>
                      {t.issuer}
                      {t === comparison.cheapest ? " · lower valuation" : ""}
                    </span>
                    <b>{formatCurrency(t.tokenPrice)}</b>
                    <small>
                      {pct(t.premiumPct, 1)} vs mark · implies {formatValuation(t.impliedValuation)}
                    </small>
                  </div>
                ))}
              </div>
              <p className="asset-note">
                {comparison.cheapest.issuer} is the lower company valuation, {comparison.cheaperByPct.toFixed(0)}% below {comparison.priciest.issuer}. Both are price
                exposure through an SPV, not shares.
              </p>
            </section>
          )}

          <AskChips questions={[`Why did ${token.symbol} move today?`, `Who holds ${token.symbol}?`, `Is ${token.symbol}'s gap normal?`]} />

          <section className="asset-section">
            <p className="eyebrow">Held by</p>
            <HeldBy ticker={token.symbol} />
          </section>

          <section className="asset-section">
            <p className="eyebrow">{company.name} in the news</p>
            <div className="mt-1">
              <NewsList scope={{ kind: "company", company: token.company }} limit={3} />
            </div>
          </section>
        </div>

        <TradeTicket key={token.mint} target={{ kind: "pre-ipo", token }} compact />
      </div>
    </Panel>
  );
}
