"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { fillFor } from "@/lib/palette";
import { formatPercent } from "@/lib/format";
import { describeSoleraScore, type HoldingWithValue } from "@/lib/portfolio";
import type { Investor } from "@/lib/types";
import { FollowButton } from "@/components/FollowButton";
import { Verified } from "./Verified";

export type PeopleView = "score" | "move";
export type MoveWindow = "7d" | "30d";

interface Props {
  rank: number;
  investor: Investor;
  holdings: HoldingWithValue[];
  /** A signature-verified profile exists for this wallet. */
  claimed: boolean;
  view: PeopleView;
  window: MoveWindow;
  /** Normalised 0–100 Solera Score. */
  score: number;
}

const signClass = (v: number) => (v >= 0 ? "up" : "down");

/**
 * One line of the People card (partner engine.js:715-721): rank, initials,
 * name with the check only for a claimed profile, handle and top holding,
 * bio, the move or score column, Follow and Copy. Real wallets only.
 */
export function PersonRow({ rank, investor, holdings, claimed, view, window, score }: Props) {
  const top = holdings[0];
  const isWallet = investor.kind === "wallet";
  const avatarStyle = { "--tk": fillFor(investor.avatarColor, investor.initials) } as CSSProperties;

  return (
    <li className="person" data-holder={investor.id}>
      <span className="rank">{String(rank).padStart(2, "0")}</span>
      <span className="avatar sm" style={avatarStyle} aria-hidden="true">
        {investor.initials}
      </span>
      <Link href={`/investor/${investor.id}`} className="person-main">
        <b>
          <span>{investor.name}</span>
          {claimed && <Verified />}
        </b>
        <small>
          {investor.handle}
          {top && (
            <>
              {" · "}
              <span className="person-top" data-sym={top.ticker}>
                {top.allocationPct.toFixed(0)}% {top.ticker}
              </span>
            </>
          )}
        </small>
        {/* On-chain wallets carry a generated sentence ("A real Solana wallet holding…"); it says nothing per row. Claimed and sample bios still show. */}
        {isWallet ? null : <span className="bio">{investor.bio}</span>}
      </Link>
      <span className="person-perf">
        {view === "score" ? (
          <>
            <b className="score">
              {Math.round(score)}
              <small>/100</small>
            </b>
            <small>{describeSoleraScore(score).toLowerCase()}</small>
          </>
        ) : isWallet ? (
          <>
            <b className={`${signClass(investor.performancePct)}${window === "7d" ? "" : " off"}`}>{formatPercent(investor.performancePct)}</b>
            <small>7d</small>
            {investor.performance30dPct !== undefined && (
              <>
                <b className={`${signClass(investor.performance30dPct)}${window === "30d" ? "" : " off"}`}>{formatPercent(investor.performance30dPct)}</b>
                <small>30d</small>
              </>
            )}
          </>
        ) : null}
      </span>
      <span className="person-actions">
        <FollowButton investorId={investor.id} name={investor.name} />
        {top && (
          <Link
            href={`/buy/${top.ticker}?ref=${encodeURIComponent(investor.id)}`}
            className="btn-secondary btn-small person-copy"
            aria-label={`Copy ${investor.name}'s ${top.ticker} position`}
          >
            Copy
          </Link>
        )}
      </span>
    </li>
  );
}
