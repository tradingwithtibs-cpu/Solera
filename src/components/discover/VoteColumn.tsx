export const VOTE_LOCKED = "Voting opens with sign-in";

/**
 * ▲ score ▼. Renders on every post; the buttons post nothing until votes
 * land with sign-in (plan.md task S2 replaces this file), so they are
 * disabled with the reason as their tooltip.
 */
export function VoteColumn({ score = 0 }: { score?: number }) {
  return (
    <span className="vote" title={VOTE_LOCKED}>
      <button type="button" disabled title={VOTE_LOCKED} aria-label="Worth reading">
        ▲
      </button>
      <b className={score > 0 ? "up" : score < 0 ? "down" : ""}>{score}</b>
      <button type="button" disabled title={VOTE_LOCKED} aria-label="Not worth it">
        ▼
      </button>
    </span>
  );
}
