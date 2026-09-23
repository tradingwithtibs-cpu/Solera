"use client";

import type { PositionNote } from "@/lib/notes";
import { getPremiumPct, getUnderlyingQuote } from "@/lib/live-prices";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { PositionView } from "./use-portfolio-view";

/**
 * The thesis read back against what happened. Descriptive only: price vs
 * cost, token vs its reference, who among the top wallets holds it, and
 * whether the person has marked their own "wrong if" as having happened.
 */
export function Scorecard({
  position,
  note,
  holders,
  onToggleWrongHit,
}: {
  position: PositionView;
  note?: PositionNote;
  /** Top on-chain wallets holding this ticker; null while unknown. */
  holders: number | null;
  onToggleWrongHit: () => void;
}) {
  let line: React.ReactNode;
  if (position.kind === "xstock") {
    const gap = getPremiumPct(position.ticker);
    const quote = getUnderlyingQuote(position.ticker);
    const reference =
      gap !== undefined ? (
        <>
          <b>{formatPercent(gap)}</b> vs the exchange reference.
        </>
      ) : quote?.stale ? (
        <>the exchange is closed, so no reference gap right now.</>
      ) : (
        <>there is no exchange reference for this one.</>
      );
    line =
      position.gainPct !== undefined ? (
        <>
          Price is <b>{formatPercent(position.gainPct)}</b> vs your cost and {reference}
        </>
      ) : (
        <>
          Bought outside Solera, so no cost to compare. {gap !== undefined ? <>Token is {reference}</> : <>And {reference}</>}
        </>
      );
  } else {
    line =
      position.premiumPct !== undefined && position.markPrice !== undefined ? (
        <>
          Token is <b>{formatPercent(position.premiumPct)}</b> vs the issuer mark ({formatCurrency(position.markPrice)}).
        </>
      ) : (
        <>No issuer mark to compare against yet.</>
      );
  }

  const crowd =
    position.kind === "xstock" && holders !== null ? (
      holders > 0 ? (
        <>
          <b>{holders}</b> of the top on-chain wallets hold this.
        </>
      ) : (
        <>No tracked wallet holds this.</>
      )
    ) : null;

  const hit = note?.wrongHitAt ?? null;

  return (
    <div className="pf-scorecard">
      <p>{line}</p>
      {crowd && <p>{crowd}</p>}
      {note?.wrongIf && (
        <p className={`pf-wrong ${hit ? "hit" : ""}`}>
          <span>
            Wrong if: “{note.wrongIf}” —{" "}
            {hit ? (
              <>
                <b>you marked it happened</b> {new Date(hit).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </>
            ) : (
              "not marked"
            )}
          </span>
          <button type="button" className="pf-tiny" onClick={onToggleWrongHit}>
            {hit ? "undo" : "it happened"}
          </button>
        </p>
      )}
    </div>
  );
}
