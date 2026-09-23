"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/panels/Panel";
import { useInvestors } from "@/hooks/use-investors";
import { useFollowedInvestors } from "@/hooks/use-followed-investors";
import { useProfiles } from "@/hooks/use-profiles";
import { computeTrendingTickers } from "@/lib/portfolio";
import { getTickerInfo, isKnownTicker } from "@/lib/catalog";
import { formatCompactUsd } from "@/lib/pre-ipo";
import { formatCurrency } from "@/lib/format";
import { useTape } from "./tape-store";
import { actorName, fillSymbol, fromPublicFill, groupLastHour } from "./feed";

const ABOUT = "Ranked by value held across the largest on-chain wallets holding tokenized stocks. Solera adds nothing: no boost, no paid placement, no picks.";

function symbolHref(symbol: string): string {
  return isKnownTicker(symbol) ? `/asset/${encodeURIComponent(symbol)}` : "/pre-ipo";
}

function symbolName(symbol: string): string {
  return isKnownTicker(symbol) ? getTickerInfo(symbol).name : symbol;
}

/**
 * Trending, the Thursday fallback: what the largest on-chain wallets hold
 * most of, by value, then the last hour of the tape grouped by ticker and
 * the last three fills by people you follow. /api/trending (Jupiter's
 * per-token stats) arrives after Thursday and adds the window segments.
 */
export function TrendingPanel({ id = "trending" }: { id?: string }) {
  const { investors, isLoaded, source } = useInvestors();
  const tape = useTape();
  const { isFollowing } = useFollowedInvestors();

  // A clock for the "last hour" window, ticking once a minute (never Date.now() in render).
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  const ranked = useMemo(() => (source === "chain" ? computeTrendingTickers(investors).slice(0, 10) : []), [investors, source]);
  const fills = useMemo(() => tape.fills.map((f) => fromPublicFill(f, false)), [tape.fills]);
  const lastHour = useMemo(() => (now === null ? [] : groupLastHour(fills, now).slice(0, 5)), [fills, now]);
  const followed = useMemo(() => fills.filter((f) => (!!f.wallet && isFollowing(f.wallet)) || isFollowing(f.owner)).slice(0, 3), [fills, isFollowing]);
  const { get: profileFor } = useProfiles(useMemo(() => followed.map((f) => f.owner), [followed]));

  return (
    <Panel id={id} title="Trending" subtitle="by value held · top on-chain wallets" bodyClassName="tr-panel-body">
      <div className="tr-body">
        <section>
          <div className="tr-head">
            <p className="eyebrow">Most held by top wallets</p>
            <span className="tr-about" title={ABOUT}>
              About trending ⓘ
            </span>
          </div>
          {!isLoaded ? (
            <div className="tr-skeleton mt-2" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton" />
              ))}
              <p className="tr-empty">Reading the largest wallets on Solana…</p>
            </div>
          ) : ranked.length === 0 ? (
            <p className="tr-empty">{source === "chain" ? "No wallets to rank yet." : "Wallet data is unavailable right now."}</p>
          ) : (
            <ol className="tr-list">
              {ranked.map((t, i) => (
                <li key={t.ticker}>
                  <Link href={symbolHref(t.ticker)} data-sym={t.ticker}>
                    <i>{String(i + 1).padStart(2, "0")}</i>
                    <b>{t.ticker}</b>
                    <small>{symbolName(t.ticker)}</small>
                    <span className="tr-num">
                      <span>{formatCompactUsd(t.totalValue)}</span>
                      <em>
                        {t.holderCount} {t.holderCount === 1 ? "wallet" : "wallets"}
                      </em>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <p className="eyebrow">On the tape, last hour</p>
          {lastHour.length === 0 ? (
            <p className="tr-empty">quiet hour</p>
          ) : (
            <ol className="tr-list plain">
              {lastHour.map((g) => (
                <li key={g.symbol}>
                  <Link href={symbolHref(g.symbol)} data-sym={g.symbol}>
                    <b>{g.symbol}</b>
                    <small>{symbolName(g.symbol)}</small>
                    <span className="tr-num">
                      <span>
                        {g.count} {g.count === 1 ? "trade" : "trades"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <p className="eyebrow">People you follow</p>
          {followed.length === 0 ? (
            <p className="tr-empty">
              <Link href="/leaderboard">follow someone on Leaderboard</Link>
            </p>
          ) : (
            <ol className="tr-list plain">
              {followed.map((f) => (
                <li key={f.id}>
                  <Link href={symbolHref(fillSymbol(f))} data-sym={fillSymbol(f)}>
                    <b>{fillSymbol(f)}</b>
                    <small>
                      {actorName(f, profileFor(f.owner))} {f.side === "buy" ? "bought" : "sold"}
                    </small>
                    <span className="tr-num">
                      <span>{formatCurrency(f.pricePerShare)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Panel>
  );
}
