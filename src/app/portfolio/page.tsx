"use client";
import { LoadingState } from "@/components/LoadingState";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { TICKER_LIST } from "@/lib/mock-data";
import {
  buildPortfolioHistory,
  computeHoldings,
  computePortfolioPerformance,
  computeSoleraScore,
  describeSoleraScore,
  normalizeSoleraScore,
} from "@/lib/portfolio";
import { contractCost, daysToExpiration, formatExpiration } from "@/lib/options";
import { getEffectivePrice, getLivePrices, subscribeLivePrices } from "@/lib/live-prices";
import { formatCurrency } from "@/lib/format";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useActivePortfolio } from "@/hooks/use-active-portfolio";
import { HoldingRow } from "@/components/HoldingRow";
import { MarketRow } from "@/components/MarketRow";
import { TransactionRow } from "@/components/TransactionRow";
import { PerformanceBadge } from "@/components/PerformanceBadge";
import { AllocationBar } from "@/components/AllocationBar";
import { PriceChart } from "@/components/PriceChart";
import { MyWalletBadge } from "@/components/MyWalletBadge";

const RECENT_ACTIVITY_LIMIT = 3;

export default function PortfolioPage() {
  const { mode, cashBalance, holdings: rawHoldings, transactions, isLoaded } = useActivePortfolio();
  // Options are practice-only for now, so they always come from the practice store.
  const { optionPositions } = usePortfolio();
  const isLive = mode === "live";
  // Subscribed here so equity/options values below re-render when a live
  // price updates — computeHoldings and getEffectivePrice already read the
  // live price internally, they just need something to trigger a re-read.
  useSyncExternalStore(subscribeLivePrices, getLivePrices, getLivePrices);
  const holdings = computeHoldings(rawHoldings);
  const holdingsValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const totalValue = holdingsValue + cashBalance;

  // Real, computed return on what's currently held — vs. what was actually
  // paid for it — rather than a hardcoded "all time" number. This is also
  // what drives the trailing chart below, so the two stay consistent.
  const performancePct = computePortfolioPerformance(holdings);
  const history = buildPortfolioHistory(totalValue, performancePct);

  // Displayed as a bounded 0–100 score (see portfolio.ts) rather than the
  // raw, unbounded, possibly-negative value — a bare signed number reads
  // as "broken" to a consumer, not "moderately concentrated".
  const soleraScore = normalizeSoleraScore(computeSoleraScore(holdings, performancePct));

  const heldTickers = new Set(rawHoldings.map((h) => h.ticker));
  const otherMarkets = TICKER_LIST.filter((t) => !heldTickers.has(t.symbol));

  if (!isLoaded) {
    // Avoid a flash of the starting mock balance before a returning
    // visitor's real (localStorage-restored) numbers take over.
    return (
      <div className="flex flex-1 flex-col">
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="page-heading">
        <p className="eyebrow">Your long view</p>
        <h1>
          Your portfolio<span className="text-violet-500">.</span>
        </h1>
        <p>{isLive ? "Your real holdings, straight from your wallet." : "A clear picture of your practice investments."}</p>
      </header>
      <div className="px-5 pb-2">
        <div className="portfolio-balance">
          <div
            aria-hidden
            className="bg-gradient-brand pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full opacity-[0.16] blur-2xl"
          />
          <p className="eyebrow">{isLive ? "Total balance · on-chain" : "Total practice balance"}</p>
          <p className="mt-1 font-mono text-4xl font-semibold tracking-tight tabular-nums">
            {formatCurrency(totalValue)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PerformanceBadge value={performancePct} />
            <span className="text-xs text-neutral-400">unrealized return</span>
            <MyWalletBadge />
          </div>

          <div className="relative mt-3">
            <PriceChart history={history} color="portfolio" />
            <p className="mt-2 text-xs text-neutral-500">Illustrative curve · Not your account history</p>
          </div>

          <div className="mt-2 flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3">
            <span className="text-sm text-neutral-500">{isLive ? "SOL + USDC to invest" : "Cash available"}</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-neutral-900">
              {formatCurrency(cashBalance)}
            </span>
          </div>
        </div>
      </div>

      <section className="mx-5 mt-5 rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Portfolio perspective</h2>
          {holdings.length > 0 && (
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-semibold">
                {Math.round(soleraScore)}
                <span className="text-xs font-normal text-neutral-500">/100</span>
              </span>
              <span className="text-xs font-medium text-neutral-500">{describeSoleraScore(soleraScore)}</span>
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          {holdings.length
            ? `${holdings[0].ticker} is your largest holding at ${holdings[0].allocationPct.toFixed(1)}% of invested value. ${holdings[0].allocationPct > 40 ? "This concentration reduces your Solera Score." : "No position exceeds the score’s 40% concentration threshold."}`
            : isLive
              ? "Your portfolio perspective will appear once this wallet holds a tokenized stock."
              : "Your portfolio perspective will appear after your first practice investment."}
        </p>
        <Link href="/leaderboard" className="mt-3 inline-block text-xs font-semibold text-indigo-600">
          How the score works →
        </Link>
      </section>
      <div className="px-5 pb-1 pt-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Your holdings</h2>
          <span className="font-mono text-xs text-neutral-400">{formatCurrency(holdingsValue)}</span>
        </div>
        {holdings.length > 0 && (
          <div className="mt-3">
            <AllocationBar holdings={holdings} />
          </div>
        )}
      </div>
      {holdings.length === 0 ? (
        <p className="px-5 pb-2 text-xs text-neutral-400">
          No positions yet — buy something from Markets below.
        </p>
      ) : (
        <div className="divide-y divide-neutral-100 px-5">
          {holdings.map((h) => (
            <HoldingRow
              key={h.ticker}
              holding={h}
              actions={[
                { label: "Buy", href: `/buy/${h.ticker}` },
                { label: "Sell", href: `/buy/${h.ticker}?side=sell` },
              ]}
            />
          ))}
        </div>
      )}

      {optionPositions.length > 0 && (
        <>
          <div className="px-5 pb-1 pt-6">
            <h2 className="text-sm font-semibold text-neutral-900">Your options</h2>
            <p className="text-xs text-neutral-400">
              Kept separate from your shares — options don&apos;t count toward your Solera Score.
            </p>
          </div>
          <div className="divide-y divide-neutral-100 px-5">
            {optionPositions.map((p) => {
              const spot = getEffectivePrice(p.underlying);
              const intrinsic = p.side === "call" ? Math.max(0, spot - p.strike) : Math.max(0, p.strike - spot);
              const costPaid = contractCost(p.costBasisPremium, p.contracts);
              const worthNow = contractCost(intrinsic, p.contracts);
              const daysLeft = daysToExpiration(p.expiration);
              return (
                <div key={p.id} className="py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-neutral-900">
                      {p.underlying} <span className="font-mono">{formatCurrency(p.strike)}</span>{" "}
                      {p.side === "call" ? "Call" : "Put"}
                    </p>
                    <span className="shrink-0 font-mono text-xs text-neutral-400">
                      {daysLeft > 0 ? `${daysLeft}d left` : "Expired"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    <span className="font-mono">{p.contracts}</span> contract{p.contracts === 1 ? "" : "s"} · Exp{" "}
                    {formatExpiration(p.expiration)} · Paid <span className="font-mono">{formatCurrency(costPaid)}</span>
                  </p>
                  <p className="mt-1 text-xs text-neutral-400">
                    If exercised today: <span className="font-mono text-neutral-600">{formatCurrency(worthNow)}</span>{" "}
                    · simulated, not a live quote
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="flex items-baseline justify-between px-5 pb-1 pt-6">
        <h2 className="text-sm font-semibold text-neutral-900">Recent activity</h2>
        <Link href="/activity" className="text-xs font-semibold text-violet-600">
          See all
        </Link>
      </div>
      {transactions.length === 0 ? (
        <p className="px-5 pb-2 text-xs text-neutral-400">No trades yet.</p>
      ) : (
        <div className="divide-y divide-neutral-100 px-5">
          {transactions.slice(0, RECENT_ACTIVITY_LIMIT).map((t) => (
            <TransactionRow key={t.id} transaction={t} />
          ))}
        </div>
      )}

      {otherMarkets.length > 0 && (
        <>
          <div className="flex items-baseline justify-between px-5 pb-1 pt-6">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Not yet in your portfolio</h2>
              <p className="text-xs text-neutral-400">Quick buy for what you don&apos;t hold</p>
            </div>
            <Link href="/markets" className="text-xs font-semibold text-violet-600">
              All markets
            </Link>
          </div>
          <div className="flex-1 divide-y divide-neutral-100 px-5 pb-4">
            {otherMarkets.map((t) => (
              <MarketRow key={t.symbol} ticker={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
