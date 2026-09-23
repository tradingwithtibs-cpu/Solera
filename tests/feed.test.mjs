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
const { hotScore, rankPosts, fillTitle, parseFeedQuery, parseTarget, parseVoteDir, decodeCursor } = load("../src/lib/feed.ts");

const H = 3_600_000;

test("hot ranking is the partner's formula on real votes; new is by time", () => {
  const now = 1_000 * H;
  assert.equal(hotScore(10, now, now), 10 / Math.pow(2, 1.4));
  const a = { id: "a", score: 10, createdAt: now - 10 * H };
  const b = { id: "b", score: 3, createdAt: now - 1 * H };
  const c = { id: "c", score: 0, createdAt: now };
  assert.deepEqual(rankPosts([a, b, c], "hot", now).map((p) => p.id), ["b", "a", "c"]);
  assert.deepEqual(rankPosts([a, b, c], "new", now).map((p) => p.id), ["c", "b", "a"]);
  assert.equal(hotScore(0, now - 500 * H, now), 0, "no votes never ranks above zero");
});

test("a fill's post title, the query, the target and the vote direction", () => {
  assert.equal(fillTitle({ side: "buy", quantity: 0.42, ticker: "TSLAx", mint: null, pricePerShare: 379.6 }), "bought 0.42 TSLAx at $379.60");
  assert.equal(fillTitle({ side: "sell", quantity: 5, ticker: null, mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", pricePerShare: 1276.523 }), "sold 5 Prew…rpgF at $1,276.52");
  const params = (o) => ({ get: (k) => o[k] ?? null });
  assert.deepEqual(parseFeedQuery(params({})), { sort: "hot", ticker: null, limit: 30, offset: 0 });
  assert.deepEqual(parseFeedQuery(params({ sort: "new", ticker: "AAPLx", limit: "500", cursor: "30" })), { sort: "new", ticker: "AAPLx", limit: 100, offset: 30 });
  assert.equal(parseFeedQuery(params({ ticker: "../x" })).ticker, null);
  assert.equal(decodeCursor("-4"), 0);
  const id = "11111111-2222-4333-8444-555555555555";
  assert.deepEqual(parseTarget({ postId: id }), { postId: id });
  assert.deepEqual(parseTarget({ newsId: "12345" }), { newsId: "12345" });
  assert.deepEqual(parseTarget({ fillId: id, fillMode: "practice" }), { fillId: id, fillMode: "practice" });
  assert.equal(parseTarget({ fillId: id, fillMode: "paper" }), null);
  assert.equal(parseTarget({ postId: "not-a-uuid" }), null);
  assert.equal(parseTarget({ title: "client-supplied", url: "x" }), null, "clients never name the post's fields");
  assert.equal(parseVoteDir(1), 1);
  assert.equal(parseVoteDir(0), 0);
  assert.equal(parseVoteDir("1"), null);
  assert.equal(parseVoteDir(2), null);
});
