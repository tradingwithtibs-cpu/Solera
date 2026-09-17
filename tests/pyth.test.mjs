import { test } from "node:test";
import { createRequire } from "node:module";
const load = createRequire(import.meta.url);
import assert from "node:assert/strict";
import ts from "typescript";
import fs from "node:fs";
load.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
const { PYTH_FEEDS, hermesPriceToNumber, isUnderlyingStale, premiumPct } = load("../src/lib/pyth-feeds.ts");
const { TICKERS } = load("../src/lib/mock-data.ts");
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("every ticker has distinct xStock and equity feed IDs", () => {
  const ids = new Set();
  for (const ticker of Object.keys(TICKERS)) {
    const pair = PYTH_FEEDS[ticker];
    assert.ok(pair, `missing feed pair for ${ticker}`);
    for (const id of [pair.xstock, pair.equity]) {
      assert.match(id, /^[0-9a-f]{64}$/);
      assert.ok(!ids.has(id), `duplicate feed id ${id}`);
      ids.add(id);
    }
  }
});

test("Hermes mantissa/exponent decodes to a plain price and rejects garbage", () => {
  near(hermesPriceToNumber({ price: "23118000000", expo: -8 }), 231.18);
  near(hermesPriceToNumber({ price: "57235", expo: -2 }), 572.35);
  assert.ok(Number.isNaN(hermesPriceToNumber({ price: "abc", expo: -8 })));
});

test("underlying print is stale once older than the session gap threshold", () => {
  const now = 1_800_000_000_000;
  assert.equal(isUnderlyingStale(now / 1000 - 60, now), false);
  assert.equal(isUnderlyingStale(now / 1000 - 16 * 60, now), true);
});

test("premium is signed percent vs underlying and undefined when unusable", () => {
  near(premiumPct(101, 100), 1);
  near(premiumPct(99, 100), -1);
  assert.equal(premiumPct(undefined, 100), undefined);
  assert.equal(premiumPct(100, 0), undefined);
  assert.equal(premiumPct(NaN, 100), undefined);
});

const { derivePriceUpdateAddress, parsePriceUpdateV2 } = load("../src/lib/pyth-onchain.ts");

// Real Equity.US.AAPL/USD PriceUpdateV2 account (shard 1), captured from
// mainnet on 2026-09-17 at D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW.
const AAPL_ACCOUNT_B64 =
  "IvEjY51+9M20lIZyMNU/Ew6sDypIEyPeOYmooRWTOJq2X67JeylJMQFJ9rZcsd5rEOr3XnwDygKcMG0DV+kbUxGxdQhKWtVWiKohAAIAAAAAbw8AAAAAAAD7////diSsagAAAAB1JKxqAAAAADaz/wEAAAAASgcAAAAAAADQsbEaAAAAAAA=";

test("derives the mainnet PriceUpdateV2 address for a feed and shard", () => {
  const addr = derivePriceUpdateAddress(PYTH_FEEDS.AAPLx.equity, 1);
  assert.equal(addr.toBase58(), "D9uk39pqZMcnmtPP9WeC8cREUpKZmyXLga9mSQ79SphW");
});

test("parses a real PriceUpdateV2 account and rejects non-matching bytes", () => {
  const parsed = parsePriceUpdateV2(Buffer.from(AAPL_ACCOUNT_B64, "base64"));
  assert.ok(parsed);
  assert.equal(parsed.feedId, PYTH_FEEDS.AAPLx.equity);
  near(parsed.price, 335.6305);
  assert.equal(parsed.publishTime, 1789666422);
  assert.ok(parsed.conf > 0 && parsed.conf < 1);
  assert.equal(parsePriceUpdateV2(Buffer.alloc(134)), null);
  assert.equal(parsePriceUpdateV2(Buffer.from(AAPL_ACCOUNT_B64, "base64").subarray(0, 60)), null);
});
