"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Panel } from "@/components/panels/Panel";
import { RANGES, RangeSwitch } from "@/components/ui/RangeSwitch";
import { AllocationBar } from "@/components/AllocationBar";
import { ProfileButton } from "@/components/ProfileButton";
import { useConnectWallet } from "@/components/ConnectWalletProvider";
import { useHistoryRange } from "@/hooks/use-history-range";
import { useMediaQuery } from "@/hooks/use-media";
import { useNotes } from "@/hooks/use-notes";
import { useProfile } from "@/hooks/use-profiles";
import { useAuthUser } from "@/hooks/use-auth-user";
import { useFollowedInvestors } from "@/hooks/use-followed-investors";
import { useInvestors } from "@/hooks/use-investors";
import { isFeatured } from "@/lib/catalog";
import { isLiveHistory, setHistory, type HistoryWindow } from "@/lib/live-prices";
import { buildRealPortfolioHistory } from "@/lib/portfolio";
import { formatCurrency, formatPercent } from "@/lib/format";
import { HeroChart } from "./HeroChart";
import { useNow } from "./use-now";
import { usePortfolioView } from "./use-portfolio-view";

const DELTA_PHRASE: Record<HistoryWindow, string> = {
  "24h": "today",
  "7d": "this week",
  "30d": "this month",
  "180d": "over six months",
};

/** Counts a figure up to its new value; jumps under reduced motion. */
function useTween(value: number, ms = 700): number {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    const from = shownRef.current;
    const to = value;
    if (reduced || from === to) {
      const frame = requestAnimationFrame(() => {
        shownRef.current = to;
        setShown(to);
      });
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(t: number) {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = from + (to - from) * eased;
      shownRef.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, ms, reduced]);
  return shown;
}

const historyInFlight = new Set<string>();

/** The 30-day series only loads for the featured eight at boot; held catalog tokens fetch theirs once here. */
function useHeldHistory(tickers: readonly string[]) {
  const key = tickers.join(",");
  useEffect(() => {
    for (const ticker of key ? key.split(",") : []) {
      if (isFeatured(ticker) || isLiveHistory(ticker, "30d") || historyInFlight.has(ticker)) continue;
      historyInFlight.add(ticker);
      fetch(`/api/price-history?ticker=${encodeURIComponent(ticker)}`)
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as { history?: Record<string, number[]> };
          const closes = data.history?.[ticker];
          if (Array.isArray(closes) && closes.length >= 2) setHistory(ticker, closes);
        })
        .catch(() => {
          // The chart keeps saying it is loading; the next mount retries.
        })
        .finally(() => historyInFlight.delete(ticker));
    }
  }, [key]);
}

/** A first name only when a claimed profile or an email account supplies one. */
function useFirstName(address: string | undefined): string | null {
  const profile = useProfile(address);
  const user = useAuthUser();
  const fromAccount = user?.user_metadata?.display_name;
  const name = profile?.name || (typeof fromAccount === "string" ? fromAccount : "");
  const first = name.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function HeroPanel({ id }: { id: string }) {
  const view = usePortfolioView();
  const { connected, publicKey } = useWallet();
  const { openConnect } = useConnectWallet();
  const { notes } = useNotes();
  const { isFollowing } = useFollowedInvestors();
  const { investors } = useInvestors();
  const now = useNow();
  const firstName = useFirstName(publicKey?.toBase58());
  const [range, setRange] = useState<HistoryWindow>("7d");

  const heldTickers = view.equity.map((p) => p.ticker);
  useHeldHistory(heldTickers);
  useHistoryRange(heldTickers, range);

  const series = view.isLoaded ? buildRealPortfolioHistory(view.rawHoldings, view.cashBalance, range) : null;
  const delta = series && series[0] > 0 ? ((series[series.length - 1] - series[0]) / series[0]) * 100 : null;
  const shown = useTween(view.isLoaded ? view.totalValue : 0);

  const hour = now === null ? null : new Date(now).getHours();
  const timeOfDay = hour === null ? null : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const greeting = timeOfDay === null ? " " : firstName ? `Good ${timeOfDay}, ${firstName}.` : `Good ${timeOfDay}.`;

  const following = investors.filter((i) => isFollowing(i.id)).length;
  const pinned = view.positions.filter((p) => notes[p.key]?.pinned);
  const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? range;

  const scrollToPosition = (key: string) => {
    const el = document.getElementById(`pos-${key}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    (el?.querySelector("textarea") as HTMLTextAreaElement | null)?.focus({ preventScroll: true });
  };

  return (
    <Panel id={id} hero title="Balance" tools={<RangeSwitch value={range} onChange={setRange} />}>
      {!view.isLoaded ? (
        <div className="pf-skeleton" role="status" aria-label="Loading your portfolio" aria-busy="true">
          <div className="skeleton h-3 w-32" />
          <div className="skeleton h-8 w-56" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-[150px] w-full" />
        </div>
      ) : (
        <>
          <div className="pf-hero-head">
            <div className="min-w-0">
              <p className="eyebrow">
                {view.isLive ? "Live · Solana mainnet" : "Practice mode"}
                {!view.isLive && !connected && (
                  <>
                    {" · "}
                    <button type="button" className="pf-link" onClick={openConnect}>
                      Connect a wallet to trade for real
                    </button>
                  </>
                )}
              </p>
              <p className="pf-hello">{greeting}</p>
            </div>
            {connected && <ProfileButton className="btn-secondary btn-small" />}
          </div>

          <p className="pf-balance" aria-label={`Balance ${formatCurrency(view.totalValue)}`}>
            <span>{formatCurrency(shown)}</span>
            {delta !== null ? (
              <span className={`pf-wk ${delta >= 0 ? "up" : "down"}`}>
                {delta >= 0 ? "up" : "down"} <em>{Math.abs(delta).toFixed(1)}%</em> {DELTA_PHRASE[range]}
              </span>
            ) : view.equity.length > 0 ? (
              <span className="pf-wk">loading real history</span>
            ) : null}
          </p>

          <div className="pf-kpis">
            <div>
              <small>{view.isLive ? "SOL + USDC" : "Cash"}</small>
              <b>{formatCurrency(view.cashBalance)}</b>
            </div>
            <div>
              <small>Invested</small>
              <b>{formatCurrency(view.invested)}</b>
            </div>
            <div>
              <small title="Net profit / loss since buy">NPL</small>
              <b className={view.hasBasis ? (view.performancePct >= 0 ? "up" : "down") : ""}>{view.hasBasis ? formatPercent(view.performancePct) : "—"}</b>
              {view.withoutBasis > 0 && <em>{view.withoutBasis} bought elsewhere excluded</em>}
            </div>
            <div>
              <small>Positions</small>
              <b>{view.positions.length}</b>
            </div>
            <div>
              <small>Following</small>
              <b>{following}</b>
            </div>
          </div>

          {pinned.length > 0 && (
            <div className="pf-pinned">
              {pinned.map((p) => {
                const sym = p.kind === "xstock" ? p.ticker : p.symbol;
                const pct = p.kind === "xstock" ? p.gainPct : p.premiumPct;
                return (
                  <button key={p.key} type="button" className="pf-pin-chip" onClick={() => scrollToPosition(p.key)} aria-label={`Go to ${sym}`}>
                    <i aria-hidden="true">📌</i>
                    <b>{sym}</b>
                    <span>{p.price !== undefined ? formatCurrency(p.price) : "—"}</span>
                    {pct !== undefined && <em className={pct >= 0 ? "up" : "down"}>{formatPercent(pct)}</em>}
                  </button>
                );
              })}
            </div>
          )}

          {series ? (
            <HeroChart series={series} range={range} now={now} />
          ) : (
            <div className="pf-chart-wrap">
              <p className="pf-chart-msg" aria-busy={view.equity.length > 0 || undefined}>
                {view.equity.length > 0 ? `${rangeLabel} chart loading…` : "Nothing held yet. The chart starts with your first position."}
              </p>
            </div>
          )}

          {view.valued.length > 0 && (
            <div className="mt-3">
              <AllocationBar holdings={view.valued} legend />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
