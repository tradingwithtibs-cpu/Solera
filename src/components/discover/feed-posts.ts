import { hotScore, type FeedComment, type FeedPost, type PostTarget } from "../../lib/feed";
import { ownerKind } from "../../lib/owner";
import type { FeedFill, FeedItem } from "./feed";

/**
 * Pure glue between the feed's rows and the posts table (backend.md §10):
 * the key a post is cached under, the target a vote or comment names, the
 * hot ranking over real scores, and the small labels. Relative imports
 * only so the test harness can load it without the `@/` alias.
 */

/** A row's handle on the posts store: what to send, and where the post lives once it exists. */
export type FeedTarget = { key: string; target: PostTarget; local: false } | { key: string; target: null; local: true };

export const LOCAL_FILL_COMMENTS_LOCKED = "Practice fills in this browser can't be commented on";
export const LOCAL_FILL_LOCKED = "Practice fills in this browser can't be voted on";
export const VOTE_LOCKED = "Sign in to vote";
export const COMMENTS_LOCKED = "Sign in to comment";

export function newsKey(url: string): string {
  return `news:${url}`;
}

export function fillKey(fillId: string): string {
  return `fill:${fillId}`;
}

/** Where a post from GET /api/feed is cached: news by url, fills by the fill row's id. */
export function postKeyOf(post: Pick<FeedPost, "kind" | "ref" | "url">): string {
  return post.kind === "news" ? newsKey(post.url ?? "") : fillKey(post.ref);
}

/** What a row votes or comments on. A fill from this browser's ledger has no server row, so nothing to name. */
export function feedTargetOf(item: FeedItem): FeedTarget {
  if (item.kind === "news") return { key: newsKey(item.item.url), target: { newsId: item.item.id }, local: false };
  // A room post is not a post in the votes sense: nothing to vote on, nothing to thread.
  if (item.kind === "message") return { key: `message:${item.message.id}`, target: null, local: true };
  if (item.local) return { key: `local:${item.fillId}`, target: null, local: true };
  return { key: fillKey(item.fillId), target: { fillId: item.fillId, fillMode: item.mode }, local: false };
}

/** "comment" · "1 comment" · "12 comments". */
export function commentLabel(count: number): string {
  if (!(count > 0)) return "comment";
  return count === 1 ? "1 comment" : `${count} comments`;
}

/**
 * Hot: headlines and fills that carry a note, ranked by the partner's
 * score / (ageHours + 2)^1.4 over the posts' real scores (no post → 0),
 * ties by recency. Age is the item's own time (published, or filled), so a
 * stale headline that just collected a vote does not outrank fresh news.
 */
export function hotMerge<T extends FeedItem>(items: T[], scoreOf: (item: T) => number, now: number, tieBreak: (item: T) => number = () => 0): T[] {
  const eligible = items.filter((i) => i.kind === "news" || (i.kind === "fill" && !!i.note));
  const ranked = eligible.map((item) => ({ item, hot: hotScore(scoreOf(item), item.at, now), tie: tieBreak(item) }));
  ranked.sort((a, b) => b.hot - a.hot || b.tie - a.tie || b.item.at - a.item.at);
  return ranked.map((r) => r.item);
}

/** The optimistic score after a vote: remove the old one, add the new one. */
export function applyVote(score: number, previous: -1 | 0 | 1, next: -1 | 0 | 1): number {
  return score - previous + next;
}

function short(s: string): string {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** Who wrote a comment: "You", the claimed name, the handle, the short wallet, or a short account id. */
export function commentAuthor(c: Pick<FeedComment, "owner" | "handle" | "name">, me: string | null): string {
  if (me && c.owner === me) return "You";
  if (c.name) return c.name;
  if (c.handle) return `@${c.handle}`;
  return ownerKind(c.owner) === "wallet" ? short(c.owner) : `Account ${c.owner.slice(0, 4)}`;
}

export function commentInitials(c: Pick<FeedComment, "owner" | "handle" | "name">, me: string | null): string {
  if (me && c.owner === me) return "ME";
  const label = c.name || c.handle;
  if (label) {
    return label
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }
  return c.owner.slice(0, 2).toUpperCase();
}

/** Type guard used by the rows. */
export function isFill(item: FeedItem): item is FeedFill {
  return item.kind === "fill";
}
