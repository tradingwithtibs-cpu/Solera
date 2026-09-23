import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import fs from "node:fs";
import { createRequire } from "node:module";
const load = createRequire(import.meta.url);
load.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    filename,
  );
const { newsKey, fillKey, postKeyOf, feedTargetOf, commentLabel, hotMerge, applyVote, commentAuthor, commentInitials, LOCAL_FILL_LOCKED } = load("../src/components/discover/feed-posts.ts");
const store = load("../src/components/discover/feed-store.ts");

const H = 3_600_000;
const URL_A = "https://example.com/a";
const FILL = "11111111-2222-4333-8444-555555555555";
const WALLET = "7fL9Xz3Qm2Rk8Ss1Tt4Uu6Vv9Ww2Xx5Yy8Zz1Aa4Bb7";
const USER = "0f0f0f0f-1111-4222-8333-444444444444";

const news = (id, url, at) => ({ kind: "news", id: `news:${id}`, at, item: { id, headline: "h", source: "s", url, publishedAt: at }, tickers: [], scope: "market" });
const fill = (fillId, at, extra = {}) => ({ kind: "fill", id: `fill:practice:${fillId}`, fillId, at, mode: "practice", owner: WALLET, wallet: WALLET, ticker: "AAPLx", mint: null, side: "buy", quantity: 1, pricePerShare: 1, totalValue: 1, note: "why", wrongIf: null, leg: null, via: "ticket", signature: null, mine: false, local: false, ...extra });

test("post keys: news by url, fills by the row id; targets never carry titles", () => {
  assert.equal(newsKey(URL_A), `news:${URL_A}`);
  assert.equal(fillKey(FILL), `fill:${FILL}`);
  assert.equal(postKeyOf({ kind: "news", ref: "sha", url: URL_A }), `news:${URL_A}`);
  assert.equal(postKeyOf({ kind: "practice_fill", ref: FILL, url: null }), `fill:${FILL}`);
  assert.deepEqual(feedTargetOf(news("n1", URL_A, 0)), { key: `news:${URL_A}`, target: { newsId: "n1" }, local: false });
  assert.deepEqual(feedTargetOf(fill(FILL, 0)), { key: `fill:${FILL}`, target: { fillId: FILL, fillMode: "practice" }, local: false });
  assert.deepEqual(feedTargetOf(fill("t1", 0, { id: "local:t1", local: true, mine: true })), { key: "local:t1", target: null, local: true });
  assert.equal(LOCAL_FILL_LOCKED, "Practice fills in this browser can't be voted on");
});

test("the comment label and the optimistic score", () => {
  assert.equal(commentLabel(0), "comment");
  assert.equal(commentLabel(1), "1 comment");
  assert.equal(commentLabel(12), "12 comments");
  assert.equal(commentLabel(undefined), "comment");
  assert.equal(applyVote(3, 0, 1), 4);
  assert.equal(applyVote(3, 1, 0), 2, "taking a vote back");
  assert.equal(applyVote(3, 1, -1), 1, "flipping a vote moves the score by two");
});

test("hot merges news and noted fills by score / (age + 2)^1.4, ties by recency, and skips note-less fills", () => {
  const now = 1_000 * H;
  const a = news("a", "https://x/a", now - 10 * H);
  const b = news("b", "https://x/b", now - 1 * H);
  const c = fill("c", now - 2 * H);
  const d = fill("d", now, { note: null });
  const scores = { "news:https://x/a": 10, "news:https://x/b": 3, [`fill:c`]: 0 };
  const scoreOf = (item) => scores[feedTargetOf(item).key] ?? 0;
  assert.deepEqual(hotMerge([a, b, c, d], scoreOf, now).map((i) => i.id), ["news:b", "news:a", "fill:practice:c"], "b: 3/3^1.4 beats a: 10/12^1.4; the note-less fill is out");
  // No votes anywhere: recency decides.
  assert.deepEqual(hotMerge([a, b, c], () => 0, now).map((i) => i.id), ["news:b", "fill:practice:c", "news:a"]);
  // A clock of 0 (before the first load) is still deterministic.
  assert.deepEqual(hotMerge([a, b, c], () => 0, 0).map((i) => i.id), ["news:b", "fill:practice:c", "news:a"]);
});

test("a comment's author: You, the claimed name, the handle, the short wallet, a short account id", () => {
  assert.equal(commentAuthor({ owner: WALLET, handle: null, name: null }, WALLET), "You");
  assert.equal(commentInitials({ owner: WALLET, handle: null, name: null }, WALLET), "ME");
  assert.equal(commentAuthor({ owner: WALLET, handle: "tibs", name: "Tibet S" }, null), "Tibet S");
  assert.equal(commentInitials({ owner: WALLET, handle: "tibs", name: "Tibet S" }, null), "TS");
  assert.equal(commentAuthor({ owner: WALLET, handle: "tibs", name: null }, null), "@tibs");
  assert.equal(commentAuthor({ owner: WALLET, handle: null, name: null }, null), "7fL9…4Bb7");
  assert.equal(commentAuthor({ owner: USER, handle: null, name: null }, null), "Account 0f0f");
  assert.equal(commentInitials({ owner: USER, handle: null, name: null }, null), "0F");
});

/** A fetch stub that answers by route, records calls, and can fail. */
function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null });
    const route = Object.keys(routes).find((r) => url.startsWith(r));
    const answer = route ? await routes[route](calls[calls.length - 1]) : { status: 404, body: { error: "no route" } };
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  };
  return calls;
}

const post = (over = {}) => ({ id: "p1", kind: "news", ref: "sha", ticker: null, title: "h", url: URL_A, source: "s", publishedAt: 0, owner: null, handle: null, name: null, score: 0, commentCount: 0, createdAt: 0, ...over });
const tick = () => new Promise((r) => setTimeout(r, 0));

test("store: load keys the rows, sends the token, and reads a 501 as zeros without throwing", async () => {
  store.resetFeedStore();
  const calls = stubFetch({ "/api/feed?": async () => ({ status: 200, body: { posts: [post({ score: 4, myVote: 1 }), post({ id: "p2", kind: "practice_fill", ref: FILL, url: null, score: -1 })] } }) });
  const info = console.info;
  const logged = [];
  console.info = (m) => logged.push(m);
  try {
    store.setFeedToken("tok");
    const release = store.acquireFeed(null);
    await tick();
    await tick();
    let s = store.getFeedState();
    assert.equal(s.isLoaded, true);
    assert.equal(s.configured, true);
    assert.equal(s.posts[`news:${URL_A}`].score, 4);
    assert.equal(s.posts[`news:${URL_A}`].myVote, 1);
    assert.equal(s.posts[`fill:${FILL}`].score, -1);
    assert.equal(calls[0].headers.Authorization, "Bearer tok");
    assert.match(calls[0].url, /^\/api\/feed\?sort=new&limit=100$/);
    assert.ok(s.at > 0, "the load stamps the clock");

    // Signing out forgets the person's votes at once, then reloads.
    store.setFeedToken(null);
    s = store.getFeedState();
    assert.equal(s.posts[`news:${URL_A}`].myVote, undefined);
    await tick();
    await tick();
    assert.equal(calls[1].headers.Authorization, undefined);
    release();

    // A token that arrives while a load is on the wire: one more load follows, with the token.
    store.resetFeedStore();
    const calls2 = stubFetch({ "/api/feed?": async () => ({ status: 200, body: { posts: [] } }) });
    const release1 = store.acquireFeed(null);
    store.setFeedToken("late");
    await tick();
    await tick();
    await tick();
    assert.equal(calls2.length, 2, "the in-flight load is not deduped away; it runs again");
    assert.equal(calls2[0].headers.Authorization, undefined);
    assert.equal(calls2[1].headers.Authorization, "Bearer late");
    release1();

    // A deployment without the tables: quiet, one log line, scores stay.
    store.resetFeedStore();
    stubFetch({ "/api/feed?": async () => ({ status: 501, body: { error: "The feed isn't enabled on this deployment yet." } }) });
    const release2 = store.acquireFeed("AAPLx");
    await tick();
    await tick();
    s = store.getFeedState();
    assert.equal(s.isLoaded, true);
    assert.equal(s.configured, false);
    assert.equal(s.error, null, "a load failure is never an inline error");
    assert.equal(logged.length, 1);
    assert.match(logged[0], /\[feed\] The feed isn't enabled/);
    release2();
  } finally {
    console.info = info;
    store.resetFeedStore();
  }
});

test("store: an optimistic vote moves the score at once, reconciles with the route, and reverts on failure", async () => {
  store.resetFeedStore();
  let voteAnswer = () => ({ status: 200, body: { post: post({ score: 5, myVote: 1 }) } });
  const calls = stubFetch({
    "/api/feed/vote": async (c) => voteAnswer(c),
    "/api/feed?": async () => ({ status: 200, body: { posts: [post({ score: 4, myVote: 0 })] } }),
  });
  try {
    store.setFeedToken("tok");
    const release = store.acquireFeed(null);
    await tick();
    await tick();
    const target = feedTargetOf(news("n1", URL_A, 0));
    const key = target.key;

    const p = store.voteOn(target, 1, "tok");
    let s = store.getFeedState();
    assert.equal(s.posts[key].score, 5, "moved before the route answered");
    assert.equal(s.posts[key].myVote, 1);
    await p;
    s = store.getFeedState();
    assert.equal(s.posts[key].score, 5);
    const voteCall = calls.find((c) => c.url === "/api/feed/vote");
    assert.deepEqual(voteCall.body, { newsId: "n1", dir: 1 }, "the client names the headline, never its title");
    assert.equal(voteCall.headers.Authorization, "Bearer tok");

    // Same arrow again takes the vote back.
    voteAnswer = () => ({ status: 200, body: { post: post({ score: 4, myVote: 0 }) } });
    await store.voteOn(target, 0, "tok");
    s = store.getFeedState();
    assert.equal(s.posts[key].score, 4);
    assert.equal(s.posts[key].myVote, 0);

    // A refused vote puts the old row back and surfaces the reason.
    voteAnswer = () => ({ status: 502, body: { error: "upstream down" } });
    const before = store.getFeedState().posts[key];
    const failing = store.voteOn(target, -1, "tok");
    assert.equal(store.getFeedState().posts[key].score, 3, "optimistic");
    await failing;
    s = store.getFeedState();
    assert.deepEqual(s.posts[key], before);
    assert.equal(s.error, "upstream down");
    store.clearFeedError();
    assert.equal(store.getFeedState().error, null);

    // A headline nobody has touched: the vote mints the post; a failure leaves no row behind.
    const fresh = feedTargetOf(news("n2", "https://x/none", 0));
    const failing2 = store.voteOn(fresh, 1, "tok");
    assert.equal(store.getFeedState().posts[fresh.key].score, 1);
    await failing2;
    assert.equal(store.getFeedState().posts[fresh.key], undefined);

    // Local fills and signed-out taps never reach the wire.
    const wire = calls.length;
    await store.voteOn(feedTargetOf(fill("t1", 0, { id: "local:t1", local: true })), 1, "tok");
    assert.equal(calls.length, wire);
    await store.voteOn(target, 1, null);
    assert.equal(calls.length, wire);
    assert.equal(store.getFeedState().error, "Sign in to vote.");
    release();
  } finally {
    store.resetFeedStore();
  }
});

test("store: comments load once a post exists, a post appends and bumps the count, 429 carries the route's words", async () => {
  store.resetFeedStore();
  let commentAnswer = () => ({ status: 200, body: { comment: { id: 7, postId: "p1", owner: WALLET, handle: null, name: null, body: "hello", createdAt: 1 }, post: post({ score: 4, commentCount: 1 }) } });
  stubFetch({
    "/api/feed/comments?postId=": async () => ({ status: 200, body: { comments: [{ id: 1, postId: "p1", owner: USER, handle: null, name: null, body: "first", createdAt: 0 }] } }),
    "/api/feed/comments": async (c) => commentAnswer(c),
    "/api/feed?": async () => ({ status: 200, body: { posts: [post({ score: 4, myVote: 1 })] } }),
  });
  try {
    store.setFeedToken("tok");
    const release = store.acquireFeed(null);
    await tick();
    await tick();
    await store.loadComments("p1");
    let s = store.getFeedState();
    assert.equal(s.comments.p1.isLoaded, true);
    assert.equal(s.comments.p1.items.length, 1);

    const target = feedTargetOf(news("n1", URL_A, 0));
    const c = await store.addComment(target, "hello", "tok");
    assert.equal(c.id, 7);
    s = store.getFeedState();
    assert.deepEqual(s.comments.p1.items.map((x) => x.id), [1, 7], "appended at the end");
    assert.equal(s.posts[target.key].commentCount, 1);
    assert.equal(s.posts[target.key].myVote, 1, "the count moves, the person's vote stays");

    commentAnswer = () => ({ status: 429, body: { error: "Slow down a little." } });
    await assert.rejects(store.addComment(target, "again", "tok"), /Slow down a little\./);
    await assert.rejects(store.addComment(target, "x", null), /Sign in to comment\./);
    await assert.rejects(store.addComment(feedTargetOf(fill("t1", 0, { id: "local:t1", local: true })), "x", "tok"), new RegExp(LOCAL_FILL_LOCKED.replace("'", "'")));
    release();
  } finally {
    store.resetFeedStore();
  }
});
