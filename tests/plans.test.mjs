import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import fs from "node:fs";
import { createRequire } from "node:module";
const load = createRequire(import.meta.url);
load.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
const { validateCondition, describe, met, exitHit } = load("../src/lib/plans.ts");
const { parsePlanSentence, makeResolver } = load("../src/lib/plan-parser.ts");
const { evaluatePlans, watchIsStale, WATCH_STALE_MS } = load("../src/lib/plan-evaluator.ts");

const resolve = makeResolver([
  { symbol: "AAPLx", name: "Apple" },
  { symbol: "TSLAx", name: "Tesla" },
  { symbol: "NVDAx", name: "Nvidia" },
  { symbol: "SPYx", name: "S&P 500" },
  { symbol: "METAx", name: "Meta" },
]);
const parse = (t) => parsePlanSentence(t, { resolveTicker: resolve });

test("validateCondition and describe", () => {
  const c = { ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 250 }, exits: [{ kind: "target", price: 360 }, { kind: "stop", price: 330 }], wrongIf: "deliveries miss" };
  assert.equal(validateCondition(c), null);
  assert.equal(describe(c), "when AAPLx is at or above $345.00 → buy $250.00 · then hold until target $360.00 or stop $330.00 · wrong if “deliveries miss”");
  assert.match(validateCondition({ ...c, trigger: { kind: "now" } }), /standing plan/);
  assert.equal(validateCondition({ ...c, trigger: { kind: "now" }, exits: [] }, { standing: false }), null);
  assert.match(validateCondition({ ...c, exits: [{ kind: "stop", price: 350 }] }), /stop is above/);
  assert.match(validateCondition({ ...c, action: { side: "buy" } }), /How much/);
  assert.match(validateCondition({ ...c, action: { side: "sell", amountUsd: 5 } }), /number of shares/);
  assert.match(validateCondition({ ...c, exits: [{ kind: "target", price: 1 }, { kind: "target", price: 2 }] }), /At most one/);
  assert.equal(describe({ ticker: "TSLAx", trigger: { kind: "price", op: "lte", price: 300 }, action: { side: "sell", shares: 5 }, exits: [] }), "when TSLAx is at or below $300.00 → sell 5 shares");
  assert.equal(describe({ ticker: "NVDAx", trigger: { kind: "price", op: "lte", price: 215 }, action: { side: "sell", fraction: 0.5 }, exits: [] }), "when NVDAx is at or below $215.00 → sell 50%");
  assert.equal(met({ kind: "price", op: "gte", price: 345 }, 345), true);
  assert.equal(met({ kind: "price", op: "gte", price: 345 }, 344.99), false);
  assert.equal(met({ kind: "price", op: "lte", price: 300 }, 299), true);
  assert.deepEqual(exitHit([{ kind: "target", price: 360 }, { kind: "stop", price: 330 }], 361), { kind: "target", price: 360 });
  assert.deepEqual(exitHit([{ kind: "target", price: 360 }, { kind: "stop", price: 330 }], 329), { kind: "stop", price: 330 });
  assert.equal(exitHit([{ kind: "target", price: 360 }, { kind: "stop", price: 330 }], 345), null);
});

test("parser: the three canonical prompts and the audit's two bugs", () => {
  // The partner parser read "$345" as the amount; ours asks for the size.
  const a = parse("I want to buy AAPLx if it goes over $345/tokenized share");
  assert.equal(a.condition, undefined);
  assert.match(a.question, /How much AAPLx/);
  assert.deepEqual(a.partial.trigger, { kind: "price", op: "gte", price: 345 });
  const b = parse("buy $250 of AAPLx if it goes over $345");
  assert.deepEqual(b.condition, { ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 250 }, exits: [] });
  // The partner parser turned "sell 5 shares" into sell everything.
  const c = parse("If TSLAx falls to $300 sell 5 shares");
  assert.deepEqual(c.condition, { ticker: "TSLAx", trigger: { kind: "price", op: "lte", price: 300 }, action: { side: "sell", shares: 5 }, exits: [] });
  const d = parse("show me the latest news on TSLAx");
  assert.equal(d.condition, undefined);
});

test("parser: variants, exits, wrong-if, windows, questions", () => {
  assert.deepEqual(parse("sell half of NVDAx if it drops to 215").condition, { ticker: "NVDAx", trigger: { kind: "price", op: "lte", price: 215 }, action: { side: "sell", fraction: 0.5 }, exits: [] });
  assert.deepEqual(parse("sell all my tesla when it climbs past 400").condition.action, { side: "sell", fraction: 1 });
  const e = parse("if TSLAx rises to 370, buy $250 and hold until 400 or until deliveries miss, stop at 350");
  assert.deepEqual(e.condition.trigger, { kind: "price", op: "gte", price: 370 });
  assert.deepEqual(e.condition.action, { side: "buy", amountUsd: 250 });
  assert.deepEqual(e.condition.exits, [{ kind: "stop", price: 350 }, { kind: "target", price: 400 }]);
  assert.equal(e.condition.wrongIf, "deliveries miss");
  const f = parse("if METAx rises to $760, buy 2 shares for 2 weeks");
  assert.deepEqual(f.condition.action, { side: "buy", shares: 2 });
  assert.equal(f.condition.armDays, 14);
  assert.deepEqual(parse("buy $100 of SPYx now").condition, { ticker: "SPYx", trigger: { kind: "now" }, action: { side: "buy", amountUsd: 100 }, exits: [] });
  assert.deepEqual(parse("buy 1,000 dollars of apple under $200").condition.trigger, { kind: "price", op: "lte", price: 200 });
  assert.match(parse("buy $50 of AAPLx at 345").question, /Above or below \$345/);
  assert.match(parse("buy $50 if it goes over 345").question, /Which ticker/);
  assert.match(parse("AAPLx over 345").question, /Buy or sell AAPLx/);
  assert.match(parse("buy $50 of AAPLx").question, /At what price/);
  assert.match(parse("sell TSLAx below 300").question, /How many TSLAx shares/);
  assert.match(parse("").question, /Write the plan/);
});

function fakeDeps(plans, prices, opts = {}) {
  const saved = [];
  const inbox = [];
  const fills = [];
  let t = 1_000_000;
  return {
    deps: {
      now: () => (t += 1),
      budgetMs: 8000,
      loadActive: async () => plans,
      priceFor: async () => prices,
      fillPractice: async (owner, input) => {
        if (opts.failFill) throw new Error("Your available cash changed. Please review the amount.");
        fills.push({ owner, input });
        const price = prices[input.ticker];
        return { fillId: "f1", quantity: input.quantity ?? input.amountUsd / price, pricePerShare: price };
      },
      heldShares: async () => opts.held ?? 2,
      savePlan: async (id, patch) => saved.push({ id, ...patch }),
      inbox: async (row) => inbox.push(row),
    },
    saved,
    inbox,
    fills,
  };
}

const basePlan = (over) => ({
  id: "p1", owner: "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS", wallet: null, mode: "practice", execution: "server", text: "t",
  condition: { ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 250 }, exits: [] },
  summary: "s", status: "armed", armUntil: 9_999_999_999_999, holdUntil: null, triggerOrderId: null, triggerState: null, readyAt: null, filled: null, log: [], source: "ui", evaluatedAt: null, createdAt: 0, updatedAt: 0,
  ...over,
});

test("evaluator fills a practice plan when the level is met, and not before", async () => {
  const idle = fakeDeps([basePlan()], { AAPLx: 340 });
  const r0 = await evaluatePlans(idle.deps, { pass: "minute" });
  assert.equal(r0.fired, 0);
  assert.equal(idle.fills.length, 0);
  assert.equal(idle.saved[0].evaluatedAt > 0, true);
  const hot = fakeDeps([basePlan()], { AAPLx: 346 });
  const r1 = await evaluatePlans(hot.deps, { pass: "minute" });
  assert.equal(r1.fired, 1);
  assert.equal(hot.fills[0].input.via, "plan");
  assert.equal(hot.fills[0].input.planId, "p1");
  assert.equal(hot.fills[0].input.amountUsd, 250);
  assert.equal(hot.saved[0].status, "done");
  assert.equal(hot.inbox[0].kind, "plan_filled");
});

test("evaluator: exits, expiry, notify, failure and skipped prices", async () => {
  const withExits = basePlan({ condition: { ...basePlan().condition, exits: [{ kind: "target", price: 360 }] } });
  const h = fakeDeps([withExits], { AAPLx: 350 });
  await evaluatePlans(h.deps, { pass: "minute" });
  assert.equal(h.saved[0].status, "holding");
  const holding = basePlan({ status: "holding", filled: { price: 350, shares: 0.7, at: 1 }, condition: { ...withExits.condition } });
  const x = fakeDeps([holding], { AAPLx: 361 }, { held: 0.7 });
  const rx = await evaluatePlans(x.deps, { pass: "minute" });
  assert.equal(rx.exited, 1);
  assert.equal(x.fills[0].input.side, "sell");
  assert.equal(x.fills[0].input.quantity, 0.7);
  const stale = fakeDeps([basePlan({ armUntil: 1 })], { AAPLx: 400 });
  const rs = await evaluatePlans(stale.deps, { pass: "minute" });
  assert.equal(rs.expired, 1);
  assert.equal(stale.fills.length, 0, "an expired plan never fills");
  const notify = fakeDeps([basePlan({ mode: "live", execution: "notify", wallet: "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS" })], { AAPLx: 346 });
  const rn = await evaluatePlans(notify.deps, { pass: "minute" });
  assert.equal(rn.notified, 1);
  assert.equal(notify.saved[0].status, "ready");
  assert.match(notify.inbox[0].href, /^\/buy\/AAPLx\?plan=p1$/);
  const failing = fakeDeps([basePlan()], { AAPLx: 346 }, { failFill: true });
  const rf = await evaluatePlans(failing.deps, { pass: "minute" });
  assert.equal(rf.failed, 1);
  assert.equal(failing.saved[0].status, "failed");
  assert.match(failing.inbox[0].body, /cash changed/);
  const noPrice = fakeDeps([basePlan()], {});
  const rp = await evaluatePlans(noPrice.deps, { pass: "minute" });
  assert.equal(rp.fired, 0);
  assert.equal(noPrice.saved[0].status, undefined, "no status change without a price");
  const trigger = fakeDeps([basePlan({ mode: "live", execution: "trigger", wallet: "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS", triggerOrderId: "o1" })], { AAPLx: 400 });
  const rt = await evaluatePlans(trigger.deps, { pass: "minute" });
  assert.equal(rt.fired + rt.notified, 0, "Jupiter's keeper owns trigger plans");
});

test("watchIsStale: a request runs the shared pass only when the watcher is quiet and it hasn't just tried", () => {
  const now = 1_000_000;
  assert.equal(watchIsStale(null, null, now), true, "never stamped");
  assert.equal(watchIsStale(now - WATCH_STALE_MS - 1, null, now), true, "stale stamp");
  assert.equal(watchIsStale(now - 10_000, null, now), false, "fresh stamp");
  assert.equal(watchIsStale(null, now - 10_000, now), false, "this process tried a moment ago");
  assert.equal(watchIsStale(null, now - WATCH_STALE_MS, now), true, "the attempt window has passed");
});
