import type { TradeSide } from "./types";

/**
 * The feed's pure parts (docs/port/backend.md §10): the hot ranking on real
 * votes, the sentence a fill becomes when someone votes or comments on it,
 * and the cursor. Storage and the routes live in feed-server.ts.
 */
export type PostKind = "news" | "practice_fill" | "live_fill";
export type FeedSort = "hot" | "new";

export interface FeedPost {
  id: string;
  kind: PostKind;
  ref: string;
  ticker: string | null;
  title: string;
  url: string | null;
  source: string | null;
  publishedAt: number | null;
  owner: string | null;
  /** Claimed profile, when the owner has one. */
  handle: string | null;
  name: string | null;
  score: number;
  commentCount: number;
  myVote?: -1 | 0 | 1;
  createdAt: number;
}

export interface FeedComment {
  id: number;
  postId: string;
  owner: string;
  handle: string | null;
  name: string | null;
  body: string;
  createdAt: number;
}

/** What a vote or comment points at. Clients never send titles or urls; the server looks those up. */
export type PostTarget = { postId: string } | { newsId: string } | { fillId: string; fillMode: "practice" | "live" };

export const FEED_LIMIT_DEFAULT = 30;
export const FEED_LIMIT_MAX = 100;
export const FEED_WINDOW = 400;

/** The partner's formula on real votes: score / (ageHours + 2)^1.4. */
export function hotScore(score: number, createdAt: number, now: number): number {
  const ageHours = Math.max(0, now - createdAt) / 3_600_000;
  return score / Math.pow(ageHours + 2, 1.4);
}

export function rankPosts<T extends { score: number; createdAt: number }>(posts: T[], sort: FeedSort, now: number): T[] {
  const copy = [...posts];
  if (sort === "new") return copy.sort((a, b) => b.createdAt - a.createdAt);
  return copy.sort((a, b) => hotScore(b.score, b.createdAt, now) - hotScore(a.score, a.createdAt, now) || b.createdAt - a.createdAt);
}

/** The one-line title a fill gets as a post: "bought 0.42 TSLAx at $379.60". */
export function fillTitle(fill: { side: TradeSide; quantity: number; ticker: string | null; mint: string | null; pricePerShare: number }): string {
  const qty = Number(fill.quantity.toFixed(4)).toString();
  const what = fill.ticker ?? (fill.mint ? `${fill.mint.slice(0, 4)}…${fill.mint.slice(-4)}` : "a token");
  const price = fill.pricePerShare.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${fill.side === "buy" ? "bought" : "sold"} ${qty} ${what} at $${price}`;
}

/** Offset cursors: the list is re-ranked on every read, so an offset is honest enough for a page of 30. */
export function encodeCursor(offset: number): string {
  return String(Math.max(0, Math.floor(offset)));
}

export function decodeCursor(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function parseFeedQuery(params: { get(name: string): string | null }): { sort: FeedSort; ticker: string | null; limit: number; offset: number } {
  const sort: FeedSort = params.get("sort") === "new" ? "new" : "hot";
  const rawTicker = params.get("ticker");
  const ticker = rawTicker && /^[A-Z0-9.]{1,12}x$/.test(rawTicker) ? rawTicker : null;
  const limit = Math.min(FEED_LIMIT_MAX, Math.max(1, Number(params.get("limit") ?? FEED_LIMIT_DEFAULT) || FEED_LIMIT_DEFAULT));
  return { sort, ticker, limit, offset: decodeCursor(params.get("cursor")) };
}

/** Reads a target out of a request body, or null when it names nothing. */
export function parseTarget(body: Record<string, unknown> | null | undefined): PostTarget | null {
  if (!body || typeof body !== "object") return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof body.postId === "string" && uuid.test(body.postId)) return { postId: body.postId };
  if (typeof body.newsId === "string" && body.newsId.length > 0 && body.newsId.length <= 512) return { newsId: body.newsId };
  if (typeof body.fillId === "string" && uuid.test(body.fillId) && (body.fillMode === "practice" || body.fillMode === "live")) return { fillId: body.fillId, fillMode: body.fillMode };
  return null;
}

export function parseVoteDir(raw: unknown): -1 | 0 | 1 | null {
  return raw === -1 || raw === 0 || raw === 1 ? raw : null;
}
