"use client";

import type { FeedPost } from "@/lib/feed";
import { useSession } from "@/hooks/use-session";
import { openAuthSheet } from "@/components/auth/auth-sheet-store";
import { voteOn } from "./feed-store";
import { LOCAL_FILL_LOCKED, VOTE_LOCKED, type FeedTarget } from "./feed-posts";

export { COMMENTS_LOCKED, LOCAL_FILL_LOCKED, VOTE_LOCKED } from "./feed-posts";

/**
 * ▲ score ▼ over the real post. Signed in, an arrow casts the vote (the
 * same arrow again takes it back); signed out, the arrows open the auth
 * sheet; a fill that lives only in this browser has no server row, so its
 * arrows are off with the reason as their tooltip. The score is the
 * store's; until anyone has voted the column shows a dot, not a zero.
 */
export function VoteColumn({ target, post }: { target: FeedTarget; post?: FeedPost }) {
  const { token, signedIn } = useSession();
  const score = post?.score ?? 0;
  const myVote = post?.myVote ?? 0;
  const locked = target.local;
  const reason = locked ? LOCAL_FILL_LOCKED : !signedIn ? VOTE_LOCKED : null;

  const cast = (dir: 1 | -1) => {
    if (locked) return;
    if (!signedIn || !token) {
      openAuthSheet("signup");
      return;
    }
    void voteOn(target, myVote === dir ? 0 : dir, token);
  };

  return (
    <span className="vote" data-locked={locked ? "true" : undefined}>
      <button type="button" data-vote="1" className={myVote === 1 ? "on" : undefined} disabled={locked} aria-pressed={myVote === 1} aria-label="Worth reading" title={reason ?? "Worth reading"} onClick={() => cast(1)}>
        ▲
      </button>
      <b className={score > 0 ? "up" : score < 0 ? "down" : "none"} title={reason ?? (score === 0 ? "No votes yet" : undefined)} aria-label={score === 0 ? "No votes yet" : `Score ${score}`}>
        {score === 0 ? "·" : score}
      </b>
      <button type="button" data-vote="-1" className={myVote === -1 ? "on" : undefined} disabled={locked} aria-pressed={myVote === -1} aria-label="Not worth it" title={reason ?? "Not worth it"} onClick={() => cast(-1)}>
        ▼
      </button>
    </span>
  );
}
