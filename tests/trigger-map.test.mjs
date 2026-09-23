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
const { toTriggerOrder, triggerExpiry, clampSlippage, TRIGGER_MIN_USD } = load("../src/lib/jupiter-trigger-map.ts");
const { SOL, USDC } = load("../src/lib/tokens.ts");

const W = "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS";
const AAPL = { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", decimals: 8, symbol: "AAPLx" };
const NOW = Date.UTC(2026, 8, 22, 12, 0, 0);
const DAY = 86_400_000;
const ctx = (over = {}) => ({ wallet: W, token: AAPL, price: 340, solUsd: 200, now: NOW, ...over });

test("the eight rows of backend §9.2", () => {
  // buy $50 when at or above 345 → single, SOL in, xStock out, 'above'
  const a = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 50 }, exits: [] }, ctx());
  assert.equal(a.ok, true);
  assert.equal(a.depositSubType, "single");
  assert.equal(a.order.inputMint, SOL.mint);
  assert.equal(a.order.outputMint, AAPL.mint);
  assert.equal(a.order.inputAmount, "250000000", "0.25 SOL in lamports");
  assert.equal(a.order.triggerMint, AAPL.mint);
  assert.equal(a.order.triggerCondition, "above");
  assert.equal(a.order.triggerPriceUsd, 345);
  assert.equal(a.order.slippageBps, 200);
  assert.equal(a.order.orderType, "price");
  assert.equal(a.order.orderSubType, "single");
  assert.deepEqual(a.deposit, { amount: 0.25, unit: "SOL", usd: 50 });
  assert.equal(a.summary, "Buy AAPLx with 0.25 SOL (≈ $50.00) when AAPLx is at or above $345.00. Expires Oct 22.");
  assert.match(a.disclosures[0], /^Your 0.25 SOL moves to a Jupiter vault now/);
  assert.match(a.disclosures[1], /up to 2 % \(slippage\)/);
  // buy below → limit, 'below'; paying with USDC
  const b = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "lte", price: 300 }, action: { side: "buy", amountUsd: 120 }, exits: [] }, ctx({ payWith: "USDC" }));
  assert.equal(b.order.triggerCondition, "below");
  assert.equal(b.order.inputMint, USDC.mint);
  assert.equal(b.order.inputAmount, "120000000");
  // buy with target + stop → otoco
  const c = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 50 }, exits: [{ kind: "target", price: 420 }, { kind: "stop", price: 280 }] }, ctx());
  assert.equal(c.depositSubType, "otoco");
  assert.equal(c.order.tpPriceUsd, 420);
  assert.equal(c.order.slPriceUsd, 280);
  assert.match(c.summary, /Then a target at \$420\.00 and a stop at \$280\.00\./);
  // sell 5 shares at or below 300 → single, xStock in, USDC out by default, 'below'
  const d = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "lte", price: 300 }, action: { side: "sell", shares: 5 }, exits: [] }, ctx());
  assert.equal(d.order.inputMint, AAPL.mint);
  assert.equal(d.order.outputMint, USDC.mint);
  assert.equal(d.order.inputAmount, "500000000", "5 shares × 1e8");
  assert.equal(d.order.triggerCondition, "below");
  assert.equal(d.summary, "Sell 5 AAPLx for USDC when AAPLx is at or below $300.00. Expires Oct 22.");
  assert.match(d.disclosures[0], /^Your 5 AAPLx moves to a Jupiter vault/);
  // sell above → take-profit; SOL out when asked
  const e = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 400 }, action: { side: "sell", shares: 1 }, exits: [] }, ctx({ payWith: "SOL" }));
  assert.equal(e.order.triggerCondition, "above");
  assert.equal(e.order.outputMint, SOL.mint);
  // sell a fraction of the live balance
  const f = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "lte", price: 300 }, action: { side: "sell", fraction: 0.5 }, exits: [] }, ctx({ heldShares: 4 }));
  assert.equal(f.order.inputAmount, "200000000");
  assert.deepEqual(f.deposit, { amount: 2, unit: "AAPLx", usd: 680 });
  // buy N shares → sized in settlement with 0.5 % headroom, summary says about N shares
  const g = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", shares: 2 }, exits: [] }, ctx());
  assert.equal(g.order.inputAmount, String(Math.round((2 * 340 * 1.005) / 200 * 1e9)));
  assert.match(g.summary, /about 2 shares/);
  // expiry: armUntil wins when sooner than 30 days; otherwise the 30-day cap
  assert.equal(triggerExpiry(NOW, NOW + 10 * DAY), NOW + 10 * DAY);
  assert.equal(triggerExpiry(NOW, NOW + 90 * DAY), NOW + 30 * DAY);
  assert.equal(triggerExpiry(NOW, NOW - DAY), NOW + 30 * DAY);
  const h = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 50 }, exits: [], armDays: 7 }, ctx({ armUntil: NOW + 7 * DAY }));
  assert.equal(h.order.expiresAt, new Date(NOW + 7 * DAY).toISOString());
  assert.match(h.summary, /Expires Sep 29\./);
  assert.equal(clampSlippage(undefined), 200);
  assert.equal(clampSlippage(10), 50);
  assert.equal(clampSlippage(5000), 1000);
});

test("what Jupiter cannot hold falls back to notify, with the reason", () => {
  const small = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 5 }, exits: [] }, ctx());
  assert.equal(small.ok, false);
  assert.match(small.reason, new RegExp(`under \\$${TRIGGER_MIN_USD}\\.00`));
  const oneExit = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 50 }, exits: [{ kind: "stop", price: 300 }] }, ctx());
  assert.equal(oneExit.ok, false);
  assert.match(oneExit.reason, /both a target and a stop/);
  const leg = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 50 }, exits: [], leg: "gap" }, ctx());
  assert.equal(leg.ok, false);
  const now = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "now" }, action: { side: "buy", amountUsd: 50 }, exits: [] }, ctx());
  assert.equal(now.ok, false);
  const noSol = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 50 }, exits: [] }, ctx({ solUsd: undefined }));
  assert.equal(noSol.ok, false);
  assert.match(noSol.reason, /SOL price/);
  const noBalance = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "lte", price: 300 }, action: { side: "sell", fraction: 0.5 }, exits: [] }, ctx());
  assert.equal(noBalance.ok, false);
  const wrongIfOk = toTriggerOrder({ ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 50 }, exits: [], wrongIf: "deliveries miss" }, ctx());
  assert.equal(wrongIfOk.ok, true, "a human wrong-if rides along as a note; the price condition is what Jupiter watches");
});
