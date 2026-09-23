import type { FeedComment, FeedPost } from "../../lib/feed";
import { applyVote, LOCAL_FILL_LOCKED, postKeyOf, type FeedTarget } from "./feed-posts";

/**
 * One module store of the posts behind the feed (backend.md §10), keyed
 * "news:<url>" / "fill:<id>" so a headline from /api/news and a fill from
 * the tape find their score without a second lookup. Loads on the first
 * reader, every 60 s while anything reads it, on focus, when the session
 * changes and after every vote or comment. Votes are optimistic and
 * reconciled with the row the route returns; a failed vote reverts. A
 * deployment without the tables (501) answers quietly: scores read 0,
 * nothing else changes. The React binding is src/hooks/use-feed.ts.
 */
export interface CommentsEntry {
  items: FeedComment[];
  isLoaded: boolean;
  error: string | null;
}

export interface FeedState {
  posts: Record<string, FeedPost>;
  isLoaded: boolean;
  /** null before the first answer; false when the deployment has no feed tables. */
  configured: boolean | null;
  /** The last vote or comment problem, for the panel to show inline. */
  error: string | null;
  /** When the last load finished: the clock the hot ranking uses. */
  at: number;
  comments: Record<string, CommentsEntry>;
}

export class FeedError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "FeedError";
  }
}

export const POLL_MS = 60_000;
export const FEED_LIMIT = 100;
export const EMPTY_COMMENTS: CommentsEntry = { items: [], isLoaded: false, error: null };
export const INITIAL_STATE: FeedState = { posts: {}, isLoaded: false, configured: null, error: null, at: 0, comments: {} };

let state: FeedState = INITIAL_STATE;
const listeners = new Set<() => void>();
let token: string | null = null;
let readers = 0;
/** Reader count per scope: "" is the whole feed, a ticker narrows it. */
const scopes = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
/** A refresh asked for while a load was on the wire (a token or scope change): run one more when it lands. */
let again = false;
/** Keys with a vote on the wire: a poll that lands meanwhile must not overwrite the optimistic row. */
const pending = new Set<string>();
let warned = false;

function notify() {
  listeners.forEach((l) => l());
}

function set(patch: Partial<FeedState>) {
  state = { ...state, ...patch };
  notify();
}

export function subscribeFeed(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getFeedState(): FeedState {
  return state;
}

function headers(json: boolean, sessionToken: string | null = token): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (sessionToken) h.Authorization = `Bearer ${sessionToken}`;
  return h;
}

async function call<T>(input: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, { cache: "no-store", ...init });
  } catch {
    throw new FeedError(0, "You're offline, or the feed is.");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw new FeedError(res.status, (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  return body as T;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

function warnOnce(text: string) {
  if (warned) return;
  warned = true;
  if (typeof console !== "undefined") console.info(`[feed] ${text}`);
}

function query(scope: string): string {
  return `/api/feed?sort=new&limit=${FEED_LIMIT}${scope ? `&ticker=${encodeURIComponent(scope)}` : ""}`;
}

/** GET every active scope and merge the rows in. Quiet on failure: a feed that is down reads as zeros. */
export function loadFeed(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const wanted = scopes.size ? [...scopes.keys()] : [""];
    const posts = { ...state.posts };
    let configured = state.configured;
    for (const scope of wanted) {
      try {
        const data = await call<{ posts: FeedPost[] }>(query(scope), { headers: headers(false) });
        for (const p of data.posts ?? []) {
          const key = postKeyOf(p);
          if (!pending.has(key)) posts[key] = p;
        }
        configured = true;
      } catch (err) {
        if (err instanceof FeedError && err.status === 501) configured = false;
        warnOnce(`${message(err)} Votes and comments read as zero until it answers.`);
      }
    }
    set({ posts, isLoaded: true, configured, at: Date.now() });
  })().finally(() => {
    inflight = null;
    if (again) {
      again = false;
      void refreshFeed();
    }
  });
  return inflight;
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (readers === 0) return;
    void loadFeed().then(schedule);
  }, POLL_MS);
}

/** Load now and restart the clock. Asked for mid-flight, it runs once more after the current load lands. */
export function refreshFeed(): Promise<void> {
  if (readers === 0) return Promise.resolve();
  if (inflight) {
    again = true;
    return inflight;
  }
  return loadFeed().then(schedule);
}

function onFocus() {
  void refreshFeed();
}

function onVisibility() {
  if (typeof document !== "undefined" && document.visibilityState === "visible") void refreshFeed();
}

/** A component that reads the feed. Returns the release; the first reader starts the poll, the last stops it. */
export function acquireFeed(ticker: string | null = null): () => void {
  const scope = ticker ?? "";
  const count = (scopes.get(scope) ?? 0) + 1;
  scopes.set(scope, count);
  readers += 1;
  if (readers === 1 && typeof window !== "undefined") {
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
  }
  if (readers === 1 || count === 1) void refreshFeed();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (scopes.get(scope) ?? 1) - 1;
    if (left <= 0) scopes.delete(scope);
    else scopes.set(scope, left);
    readers = Math.max(0, readers - 1);
    if (readers === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onVisibility);
      }
    }
  };
}

/** The session token GET /api/feed sends so `myVote` is filled. Signing out drops every remembered vote. */
export function setFeedToken(next: string | null) {
  if (next === token) return;
  token = next;
  if (!next) {
    const posts: Record<string, FeedPost> = {};
    for (const [key, p] of Object.entries(state.posts)) {
      const rest = { ...p };
      delete rest.myVote;
      posts[key] = rest;
    }
    set({ posts });
  }
  void refreshFeed();
}

export function clearFeedError() {
  if (state.error) set({ error: null });
}

function placeholder(t: FeedTarget & { local: false }, dir: -1 | 0 | 1, now: number): FeedPost {
  const target = t.target;
  const kind = "newsId" in target ? "news" : "fillId" in target && target.fillMode === "practice" ? "practice_fill" : "live_fill";
  return { id: "", kind, ref: "", ticker: null, title: "", url: null, source: null, publishedAt: null, owner: null, handle: null, name: null, score: dir, commentCount: 0, myVote: dir, createdAt: now };
}

/**
 * ▲ or ▼ (or 0 to take a vote back): the row moves at once, the route's
 * answer replaces it, and a failure puts the old row back with the reason
 * in `error`.
 */
export async function voteOn(t: FeedTarget, dir: -1 | 0 | 1, sessionToken: string | null): Promise<void> {
  if (t.local) return;
  if (!sessionToken) {
    set({ error: "Sign in to vote." });
    return;
  }
  const prev = state.posts[t.key];
  const prevVote = prev?.myVote ?? 0;
  const optimistic: FeedPost = prev ? { ...prev, score: applyVote(prev.score, prevVote, dir), myVote: dir } : placeholder(t, dir, Date.now());
  pending.add(t.key);
  set({ posts: { ...state.posts, [t.key]: optimistic }, error: null });
  try {
    const { post } = await call<{ post: FeedPost }>("/api/feed/vote", { method: "POST", headers: headers(true, sessionToken), body: JSON.stringify({ ...t.target, dir }) });
    pending.delete(t.key);
    set({ posts: { ...state.posts, [t.key]: { ...post, myVote: post.myVote ?? dir } } });
    void refreshFeed();
  } catch (err) {
    pending.delete(t.key);
    const posts = { ...state.posts };
    if (prev) posts[t.key] = prev;
    else delete posts[t.key];
    set({ posts, error: message(err) });
  }
}

/** GET the thread once a post exists; a headline nobody has touched has no post and no thread. */
export async function loadComments(postId: string): Promise<void> {
  const current = state.comments[postId];
  if (!current) set({ comments: { ...state.comments, [postId]: EMPTY_COMMENTS } });
  try {
    const { comments } = await call<{ comments: FeedComment[] }>(`/api/feed/comments?postId=${encodeURIComponent(postId)}`, { headers: headers(false) });
    set({ comments: { ...state.comments, [postId]: { items: comments ?? [], isLoaded: true, error: null } } });
  } catch (err) {
    const kept = state.comments[postId]?.items ?? [];
    set({ comments: { ...state.comments, [postId]: { items: kept, isLoaded: true, error: message(err) } } });
  }
}

/** POST a comment; the returned row lands at the end of the thread and the post's count moves with it. Throws with the route's reason (429 → "Slow down a little."). */
export async function addComment(t: FeedTarget, body: string, sessionToken: string | null): Promise<FeedComment> {
  if (t.local) throw new FeedError(0, LOCAL_FILL_LOCKED);
  if (!sessionToken) throw new FeedError(401, "Sign in to comment.");
  const { comment, post } = await call<{ comment: FeedComment; post: FeedPost }>("/api/feed/comments", { method: "POST", headers: headers(true, sessionToken), body: JSON.stringify({ ...t.target, body }) });
  const prev = state.posts[t.key];
  const thread = state.comments[post.id]?.items ?? [];
  set({
    posts: { ...state.posts, [t.key]: { ...post, ...(prev?.myVote !== undefined ? { myVote: prev.myVote } : {}) } },
    comments: { ...state.comments, [post.id]: { items: [...thread.filter((c) => c.id !== comment.id), comment], isLoaded: true, error: null } },
    error: null,
  });
  void refreshFeed();
  return comment;
}

/** Test seam: forget everything, as a fresh page would. */
export function resetFeedStore() {
  state = INITIAL_STATE;
  token = null;
  readers = 0;
  scopes.clear();
  pending.clear();
  inflight = null;
  again = false;
  warned = false;
  if (timer) clearTimeout(timer);
  timer = null;
  listeners.clear();
}
