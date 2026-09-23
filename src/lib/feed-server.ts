import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./http-error";
import { POST_COOLDOWN_MS } from "./chat";
import { findCachedNews } from "./news-server";
import { getSupabaseService } from "./supabase";
import { FEED_WINDOW, fillTitle, rankPosts, type FeedComment, type FeedPost, type FeedSort, type PostKind, type PostTarget } from "./feed";

/**
 * Posts, votes and comments over the port.sql tables. News posts come into
 * being only when someone votes or comments on a headline the app fetched;
 * fills become posts the same way. Nothing is seeded; scores start at zero
 * and are recounted by the database triggers.
 */
interface PostRow {
  id: string;
  kind: PostKind;
  ref: string;
  ticker: string | null;
  owner: string | null;
  title: string;
  url: string | null;
  source: string | null;
  published_at: string | null;
  score: number;
  comment_count: number;
  created_at: string;
}

const POST_COLUMNS = "id, kind, ref, ticker, owner, title, url, source, published_at, score, comment_count, created_at";

function service(): SupabaseClient {
  const s = getSupabaseService();
  if (!s) throw new HttpError(501, "The feed isn't enabled on this deployment yet.");
  return s;
}

const ts = (s: string | null) => (s ? Date.parse(s) : null);

async function profilesFor(s: SupabaseClient, owners: string[]): Promise<Map<string, { handle: string | null; name: string | null }>> {
  const out = new Map<string, { handle: string | null; name: string | null }>();
  const unique = [...new Set(owners.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data } = await s.from("profiles").select("owner, handle, name").in("owner", unique);
  for (const r of (data ?? []) as Array<{ owner: string; handle: string | null; name: string | null }>) out.set(r.owner, { handle: r.handle, name: r.name });
  return out;
}

function toPost(r: PostRow, profile?: { handle: string | null; name: string | null }, myVote?: -1 | 0 | 1): FeedPost {
  return {
    id: r.id,
    kind: r.kind,
    ref: r.ref,
    ticker: r.ticker,
    title: r.title,
    url: r.url,
    source: r.source,
    publishedAt: ts(r.published_at),
    owner: r.owner,
    handle: profile?.handle ?? null,
    name: profile?.name ?? null,
    score: r.score,
    commentCount: r.comment_count,
    ...(myVote !== undefined ? { myVote } : {}),
    createdAt: Date.parse(r.created_at),
  };
}

export function newsRef(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

/** The post a target names, created on first contact for news and fills. Never trusts a client-supplied title. */
export async function resolvePost(target: PostTarget): Promise<PostRow> {
  const s = service();
  if ("postId" in target) {
    const { data, error } = await s.from("posts").select(POST_COLUMNS).eq("id", target.postId).maybeSingle();
    if (error) throw new HttpError(502, error.message);
    if (!data) throw new HttpError(404, "No such post.");
    return data as PostRow;
  }
  let row: Omit<PostRow, "id" | "score" | "comment_count" | "created_at">;
  if ("newsId" in target) {
    const hit = findCachedNews(target.newsId);
    if (!hit) throw new HttpError(404, "That headline isn't in today's news any more. Refresh and try again.");
    row = {
      kind: "news",
      ref: newsRef(hit.item.url),
      ticker: hit.ticker ?? null,
      owner: null,
      title: hit.item.headline.slice(0, 300),
      url: hit.item.url,
      source: hit.item.source,
      published_at: new Date(hit.item.publishedAt).toISOString(),
    };
  } else {
    const table = target.fillMode === "practice" ? "practice_fills" : "live_fills";
    const { data, error } = await s.from(table).select("id, owner, ticker, mint, side, quantity, price_per_share, created_at").eq("id", target.fillId).maybeSingle();
    if (error) throw new HttpError(502, error.message);
    if (!data) throw new HttpError(404, "No such fill.");
    const f = data as { id: string; owner: string; ticker: string | null; mint: string | null; side: "buy" | "sell"; quantity: number | string; price_per_share: number | string; created_at: string };
    row = {
      kind: target.fillMode === "practice" ? "practice_fill" : "live_fill",
      ref: f.id,
      ticker: f.ticker,
      owner: f.owner,
      title: fillTitle({ side: f.side, quantity: Number(f.quantity), ticker: f.ticker, mint: f.mint, pricePerShare: Number(f.price_per_share) }),
      url: null,
      source: null,
      published_at: f.created_at,
    };
  }
  const { data, error } = await s.from("posts").upsert(row, { onConflict: "kind,ref", ignoreDuplicates: false }).select(POST_COLUMNS).single();
  if (error) throw new HttpError(502, error.message);
  return data as PostRow;
}

export async function listFeed(opts: { sort: FeedSort; ticker: string | null; limit: number; offset: number; owner: string | null }): Promise<{ posts: FeedPost[]; next: string | null }> {
  const s = service();
  let q = s.from("posts").select(POST_COLUMNS).order("created_at", { ascending: false }).limit(FEED_WINDOW);
  if (opts.ticker) q = q.eq("ticker", opts.ticker);
  const { data, error } = await q;
  if (error) throw new HttpError(502, error.message);
  const rows = (data ?? []) as PostRow[];
  const ranked = rankPosts(
    rows.map((r) => ({ row: r, score: r.score, createdAt: Date.parse(r.created_at) })),
    opts.sort,
    Date.now(),
  ).map((x) => x.row);
  const page = ranked.slice(opts.offset, opts.offset + opts.limit);
  const profiles = await profilesFor(s, page.map((r) => r.owner ?? ""));
  const votes = new Map<string, -1 | 1>();
  if (opts.owner && page.length) {
    const { data: mine } = await s.from("votes").select("post_id, dir").eq("owner", opts.owner).in("post_id", page.map((r) => r.id));
    for (const v of (mine ?? []) as Array<{ post_id: string; dir: -1 | 1 }>) votes.set(v.post_id, v.dir);
  }
  return {
    posts: page.map((r) => toPost(r, r.owner ? profiles.get(r.owner) : undefined, opts.owner ? (votes.get(r.id) ?? 0) : undefined)),
    next: opts.offset + opts.limit < ranked.length ? String(opts.offset + opts.limit) : null,
  };
}

export async function setVote(owner: string, target: PostTarget, dir: -1 | 0 | 1): Promise<FeedPost> {
  const s = service();
  const post = await resolvePost(target);
  if (dir === 0) {
    const { error } = await s.from("votes").delete().eq("post_id", post.id).eq("owner", owner);
    if (error) throw new HttpError(502, error.message);
  } else {
    const { error } = await s.from("votes").upsert({ post_id: post.id, owner, dir }, { onConflict: "post_id,owner" });
    if (error) throw new HttpError(502, error.message);
  }
  const { data, error } = await s.from("posts").select(POST_COLUMNS).eq("id", post.id).single();
  if (error) throw new HttpError(502, error.message);
  return toPost(data as PostRow, undefined, dir);
}

export async function listComments(postId: string): Promise<FeedComment[]> {
  const s = service();
  const { data, error } = await s.from("comments").select("id, post_id, owner, body, created_at").eq("post_id", postId).order("created_at", { ascending: true }).limit(200);
  if (error) throw new HttpError(502, error.message);
  const rows = (data ?? []) as Array<{ id: number; post_id: string; owner: string; body: string; created_at: string }>;
  const profiles = await profilesFor(s, rows.map((r) => r.owner));
  return rows.map((r) => ({ id: r.id, postId: r.post_id, owner: r.owner, handle: profiles.get(r.owner)?.handle ?? null, name: profiles.get(r.owner)?.name ?? null, body: r.body, createdAt: Date.parse(r.created_at) }));
}

export async function addComment(owner: string, target: PostTarget, body: string): Promise<{ comment: FeedComment; post: FeedPost }> {
  const s = service();
  const post = await resolvePost(target);
  const { data: last } = await s.from("comments").select("created_at").eq("owner", owner).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - Date.parse((last as { created_at: string }).created_at) < POST_COOLDOWN_MS) throw new HttpError(429, "Slow down a little.");
  const { data, error } = await s.from("comments").insert({ post_id: post.id, owner, body }).select("id, post_id, owner, body, created_at").single();
  if (error) throw new HttpError(502, error.message);
  const r = data as { id: number; post_id: string; owner: string; body: string; created_at: string };
  const profiles = await profilesFor(s, [owner]);
  const { data: fresh } = await s.from("posts").select(POST_COLUMNS).eq("id", post.id).single();
  return {
    comment: { id: r.id, postId: r.post_id, owner: r.owner, handle: profiles.get(owner)?.handle ?? null, name: profiles.get(owner)?.name ?? null, body: r.body, createdAt: Date.parse(r.created_at) },
    post: toPost((fresh as PostRow | null) ?? post),
  };
}
