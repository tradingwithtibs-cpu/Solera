"use client";

import { useState } from "react";
import { Panel } from "@/components/panels/Panel";
import { useInvestors } from "@/hooks/use-investors";
import { useProfiles } from "@/hooks/use-profiles";
import { computeHoldings, computeSoleraScore, normalizeSoleraScore } from "@/lib/portfolio";
import { PersonRow, type MoveWindow, type PeopleView } from "./PersonRow";

const SCORE_EXPLAINER =
  "A 0–100 score that rewards steady, well-sized positions over concentrated bets — a high return with one oversized position scores lower than the same return spread out. A concentration indicator, not a complete measure of risk. Index holdings are treated like any other position.";

/**
 * The People card (pages.md §3.7): the largest real holders of each
 * tokenized stock, ranked by Solera Score or by how the market moved what
 * they hold. Sample profiles stand in only while the chain source is down,
 * and say so.
 */
export function PeoplePanel({ id = "people" }: { id?: string }) {
  const [view, setView] = useState<PeopleView>("score");
  const [window, setWindow] = useState<MoveWindow>("7d");
  const { investors, source, isLoaded } = useInvestors();
  const chain = source === "chain";
  // Same cache useInvestors fills; read here to know which names are signature-verified claims.
  const { get: profileFor } = useProfiles(chain ? investors.map((i) => i.id) : []);

  const ranked = investors
    .map((investor) => {
      const holdings = computeHoldings(investor.holdings);
      const move = window === "30d" && investor.performance30dPct !== undefined ? investor.performance30dPct : investor.performancePct;
      // Sort on the raw score (monotonic with the normalised one); display the 0–100 version.
      const raw = computeSoleraScore(holdings, move);
      return { investor, holdings, move, raw, score: normalizeSoleraScore(raw) };
    })
    .sort((a, b) => (view === "score" ? b.raw - a.raw : b.move - a.move));

  const days = window === "30d" ? "30" : "7";
  const subtitle = chain
    ? view === "score"
      ? "Largest real holders · ranked by Solera Score"
      : `Largest real holders · ranked by ${window} move`
    : isLoaded
      ? "Sample profiles · on-chain holders loading"
      : "Reading on-chain holders";
  const foot =
    view === "score"
      ? SCORE_EXPLAINER
      : chain
        ? `Ranks real wallets by how the market moved what they hold over the last ${days} days, value-weighted. Not what they earned since buying — the chain doesn't say what they paid. Past moves do not predict future results.`
        : "Ranks the sample investors by their simulated monthly return. Past returns do not predict future results.";

  const tools = (
    <>
      <div role="group" aria-label="Leaderboard ranking" className="seg">
        <button type="button" aria-pressed={view === "score"} onClick={() => setView("score")}>
          <span className="people-long">Solera Score</span>
          <span className="people-short">Score</span>
        </button>
        <button type="button" aria-pressed={view === "move"} onClick={() => setView("move")}>
          <span className="people-long">{chain ? "Market move" : "Monthly return"}</span>
          <span className="people-short">{chain ? "Move" : "Return"}</span>
        </button>
      </div>
      {chain && (
        <div role="group" aria-label="Move window" className="range">
          <button type="button" aria-pressed={window === "7d"} onClick={() => setWindow("7d")}>
            <span className="people-long">7 days</span>
            <span className="people-short">7d</span>
          </button>
          <button type="button" aria-pressed={window === "30d"} onClick={() => setWindow("30d")}>
            <span className="people-long">30 days</span>
            <span className="people-short">30d</span>
          </button>
        </div>
      )}
    </>
  );

  return (
    <Panel id={id} title="People" subtitle={subtitle} tools={tools} foot={foot} className="people-panel prose-foot">
      <p className="people-sub">{subtitle}</p>
      {!isLoaded ? (
        <div role="status" aria-busy="true" aria-label="Reading the largest wallets on Solana">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton person-skeleton" />
          ))}
        </div>
      ) : (
        <ol className="people-list">
          {ranked.map(({ investor, holdings, score }, index) => (
            <PersonRow
              key={investor.id}
              rank={index + 1}
              investor={investor}
              holdings={holdings}
              claimed={chain && !!profileFor(investor.id)}
              view={view}
              window={window}
              score={score}
            />
          ))}
        </ol>
      )}
      <p className="people-note">
        {chain
          ? "Wallets are the largest non-custodial holders of each tokenized stock, read from public Solana data. Identities are unknown."
          : isLoaded
            ? "Sample profiles shown while on-chain holders load."
            : "Reading the largest wallets on Solana…"}
      </p>
    </Panel>
  );
}
