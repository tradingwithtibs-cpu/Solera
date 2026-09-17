"use client";
import { useState } from "react";
import Link from "next/link";
import { useInvestors } from "@/hooks/use-investors";
import { computeHoldings, computeSoleraScore, describeSoleraScore, normalizeSoleraScore } from "@/lib/portfolio";
import { Avatar } from "@/components/Avatar";
import { PerformanceBadge } from "@/components/PerformanceBadge";
import { FollowButton } from "@/components/FollowButton";
import { SegmentedControl } from "@/components/SegmentedControl";
export default function LeaderboardPage() {
  const [sortMode, setSortMode] = useState<"performance" | "score">("score");
  const { investors: INVESTORS, source } = useInvestors();
  const ranked = INVESTORS.map((investor) => {
    // Sort by the raw score (unbounded, but monotonic with the normalized
    // one below, so ranking is identical either way) — display the
    // normalized 0–100 version instead, since a bare signed number reads
    // as broken rather than "moderately concentrated". See portfolio.ts.
    const rawScore = computeSoleraScore(computeHoldings(investor.holdings), investor.performancePct);
    return { investor, rawScore, score: normalizeSoleraScore(rawScore) };
  }).sort((a, b) =>
    sortMode === "score" ? b.rawScore - a.rawScore : b.investor.performancePct - a.investor.performancePct,
  );
  return (
    <div className="flex flex-1 flex-col">
      <header className="page-heading">
        <p className="eyebrow">More than a winning streak</p>
        <h1>
          A broader view
          <br />
          of performance<span className="text-violet-500">.</span>
        </h1>
        <p>Explore returns with portfolio concentration in mind.</p>
      </header>
      <div className="px-5 pb-5 sm:px-7">
        <SegmentedControl
          label="Leaderboard ranking"
          value={sortMode}
          onChange={setSortMode}
          options={[
            { value: "score", label: "Solera Score" },
            { value: "performance", label: source === "chain" ? "7-day move" : "Monthly return" },
          ]}
        />
        <div className="mt-4 rounded-2xl bg-[#ece7fb] p-4 text-xs leading-relaxed text-neutral-600">
          {sortMode === "score"
            ? "A 0–100 score that rewards steady, well-sized positions over concentrated bets — a high return with one oversized position scores lower than the same return spread out. A concentration indicator, not a complete measure of risk. Index holdings are treated like any other position."
            : source === "chain"
              ? "Ranks real wallets by how the market moved what they hold over the last 7 days, value-weighted. Not what they earned since buying — the chain doesn't say what they paid. Past moves do not predict future results."
              : "Ranks the sample investors by their simulated monthly return. Past returns do not predict future results."}
        </div>
      </div>
      <div className="flex-1 space-y-3 px-5 pb-7 sm:px-7">
        {ranked.map(({ investor, score }, index) => {
          const scoreLabel = describeSoleraScore(score);
          return (
            <article key={investor.id} className="rank-card">
              <span className="font-mono text-lg text-neutral-400">{String(index + 1).padStart(2, "0")}</span>
              <Link href={`/investor/${investor.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar initials={investor.initials} colorClass={investor.avatarColor} size="sm" />
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{investor.name}</h2>
                  <p className="text-xs text-neutral-500">{investor.holdings.length} positions</p>
                </div>
              </Link>
              <div className="flex flex-col items-end gap-2">
                {sortMode === "performance" ? (
                  <PerformanceBadge value={investor.performancePct} />
                ) : (
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-mono text-base font-semibold">
                      {Math.round(score)}
                      <span className="text-xs font-normal text-neutral-500">/100</span>
                    </span>
                    <span className="text-xs font-medium text-neutral-500">{scoreLabel}</span>
                  </span>
                )}
                <FollowButton investorId={investor.id} />
              </div>
            </article>
          );
        })}
        <p className="py-3 text-xs text-neutral-500">
          {source === "chain"
            ? "Wallets are the largest non-custodial holders of each tokenized stock, read from public Solana data. Identities are unknown."
            : "Sample profiles shown while on-chain holders load."}
        </p>
      </div>
    </div>
  );
}
