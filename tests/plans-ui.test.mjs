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
const {
  STATUS_LABEL,
  STATUS_TONE,
  statusTitle,
  sortPlans,
  relTime,
  signedDistance,
  exampleChips,
  watchLine,
  armedToast,
  healthLine,
  modeNotice,
  readyToastText,
  triggerStateLabel,
  triggerAction,
  jupiterLine,
  jupiterHoldingLine,
  walletNotice,
  shortWallet,
  shortId,
  FOOT_PRACTICE,
  FOOT_LIVE,
} = load("../src/components/plans/plan-format.ts");

const T0 = Date.parse("2026-09-23T12:00:00Z");
const cond = (over = {}) => ({ ticker: "TSLAx", trigger: { kind: "price", op: "lte", price: 300 }, action: { side: "sell", shares: 5 }, exits: [], ...over });
const plan = (over = {}) => ({
  id: "p1",
  owner: "o",
  wallet: null,
  mode: "practice",
  execution: "server",
  text: "if TSLAx falls to $300 sell 5 shares",
  condition: cond(),
  summary: "when TSLAx is at or below $300.00 → sell 5 shares",
  status: "armed",
  armUntil: null,
  holdUntil: null,
  triggerOrderId: null,
  triggerState: null,
  readyAt: null,
  filled: null,
  log: [{ at: T0, from: null, to: "proposed", msg: "proposed" }],
  source: "ui",
  evaluatedAt: null,
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

test("status labels, tones and hover text are the copy sheet's", () => {
  assert.deepEqual(STATUS_LABEL, {
    proposed: "PROPOSED",
    armed: "ARMED",
    holding: "HOLDING",
    ready: "READY TO SIGN",
    done: "FILLED",
    failed: "FAILED",
    cancelled: "CANCELLED",
    expired: "EXPIRED",
  });
  assert.equal(STATUS_TONE.cancelled, "muted");
  assert.equal(STATUS_TONE.expired, "muted");
  assert.equal(STATUS_TONE.failed, "failed");
  assert.equal(statusTitle(plan()), "watching the price; nothing has happened yet");
  assert.equal(statusTitle(plan({ status: "holding" })), "bought; watching the exit levels");
  assert.equal(statusTitle(plan({ status: "ready" })), "the price is there; open the ticket and sign");
  assert.match(statusTitle(plan({ status: "done", filled: { price: 299.62, shares: 5, at: T0 } })), /^filled at \$299\.62 on Sep 23$/);
  assert.equal(statusTitle(plan({ status: "failed", log: [{ at: T0, from: "armed", to: "failed", msg: "Your available cash changed. Please review the amount." }] })), "Your available cash changed. Please review the amount.");
  assert.equal(statusTitle(plan({ status: "expired", log: [{ at: T0, from: "armed", to: "expired", msg: "arm window ended" }] })), "expired before the trigger hit");
  assert.equal(statusTitle(plan({ status: "expired", log: [{ at: T0, from: "holding", to: "expired", msg: "hold window ended, position kept" }] })), "hold window ended, position kept");
  assert.equal(statusTitle(plan({ status: "cancelled" })), undefined);
});

test("sortPlans: live rows newest first, six finished rows, no proposed", () => {
  const rows = [
    plan({ id: "a", status: "armed", createdAt: T0 - 3_000 }),
    plan({ id: "b", status: "proposed", createdAt: T0 }),
    plan({ id: "c", status: "ready", createdAt: T0 - 1_000 }),
    plan({ id: "d", status: "holding", createdAt: T0 - 2_000 }),
    ...Array.from({ length: 8 }, (_, i) => plan({ id: `f${i}`, status: i % 2 ? "done" : "cancelled", createdAt: T0 - 60_000 * (i + 1), updatedAt: T0 - 10_000 * (i + 1) })),
  ];
  const { live, earlier } = sortPlans(rows);
  assert.deepEqual(
    live.map((p) => p.id),
    ["c", "d", "a"],
  );
  assert.equal(earlier.length, 6);
  assert.deepEqual(
    earlier.map((p) => p.id),
    ["f0", "f1", "f2", "f3", "f4", "f5"],
  );
  assert.ok(!earlier.some((p) => p.status === "proposed"));
});

test("relative time and signed distance", () => {
  assert.equal(relTime(T0 - 12_000, T0), "12 s");
  assert.equal(relTime(T0 - 2 * 60_000, T0), "2 min");
  assert.equal(relTime(T0 - 3 * 3_600_000, T0), "3 h");
  assert.equal(relTime(T0 - 2 * 86_400_000, T0), "2 d");
  assert.equal(relTime(T0 + 5_000, T0), "0 s");
  assert.equal(signedDistance(300, 379.48), "−20.9%");
  assert.equal(signedDistance(345, 340.14), "+1.4%");
  assert.equal(signedDistance(300, 300), "0.0%");
  assert.equal(signedDistance(300, 0), "—");
});

test("example chips come from live prices with the exact templates, and hide without one", () => {
  const prices = { TSLAx: 379.48, NVDAx: 229.69, SPYx: 773.78 };
  assert.deepEqual(exampleChips((t) => prices[t]), [
    "if TSLAx falls to $360, buy $250",
    "sell half of NVDAx if it rises to $249",
    "if SPYx rises to $797, buy $100, stop at $758",
  ]);
  assert.deepEqual(exampleChips((t) => (t === "SPYx" ? 773.78 : undefined)), ["if SPYx rises to $797, buy $100, stop at $758"]);
  assert.deepEqual(exampleChips(() => undefined), []);
  assert.deepEqual(exampleChips(() => 0), []);
});

test("the watching line: price, trigger distance, freshness, and the no-price case", () => {
  const armed = plan({ evaluatedAt: T0 - 12_000 });
  assert.equal(watchLine(armed, 379.48, T0), "watching TSLAx · now $379.48 · trigger $300.00 (−20.9%) · checked 12 s ago");
  assert.equal(watchLine(armed, undefined, T0), "no live price for TSLAx right now · plan still armed");
  const holding = plan({ status: "holding", evaluatedAt: T0 - 60_000, condition: cond({ action: { side: "buy", amountUsd: 250 }, exits: [{ kind: "target", price: 420 }, { kind: "stop", price: 280 }] }) });
  assert.equal(watchLine(holding, 379.48, T0), "holding · now $379.48 · target $420.00 / stop $280.00 · checked 1 min ago");
  const notify = plan({ mode: "live", execution: "notify", evaluatedAt: T0 - 12_000 });
  assert.equal(watchLine(notify, 379.48, T0), "notify + sign · Solera watching · watching TSLAx · now $379.48 · trigger $300.00 (−20.9%) · checked 12 s ago");
});

test("toasts, feet, health and the mode notice", () => {
  assert.equal(armedToast(plan()), "Armed: when TSLAx is at or below $300.00 → sell 5 shares");
  assert.equal(armedToast(plan({ mode: "live", execution: "notify" })), "Armed. You'll get a notification here when TSLAx is at or below $300.00.");
  assert.equal(armedToast(plan({ mode: "live", condition: cond({ trigger: { kind: "price", op: "gte", price: 345 } }) })), "Armed. You'll get a notification here when TSLAx is at or above $345.00.");
  assert.match(FOOT_PRACTICE, /checked about once a minute/);
  assert.ok(!/24\/7/.test(FOOT_PRACTICE));
  assert.match(FOOT_LIVE, /one signature per order/);
  assert.equal(healthLine({ lastEvaluatedAt: T0 - 12_000, serverWatch: true }, T0), "server watch: on · last check 12 s ago");
  assert.equal(healthLine({ lastEvaluatedAt: T0 - 600_000, serverWatch: false }, T0), "server watch: off · checking while this tab is open");
  assert.equal(healthLine(null, T0), "server watch: off · checking while this tab is open");
  assert.equal(modeNotice([plan(), plan({ mode: "live", execution: "notify" })], "practice"), "1 live plan is still being watched by Solera.");
  assert.equal(modeNotice([plan({ mode: "live", execution: "trigger" }), plan({ mode: "live", execution: "trigger" })], "practice"), "2 live plans are still being watched by Jupiter.");
  assert.equal(modeNotice([plan(), plan({ mode: "live" })], "live"), "1 practice plan still runs on Solera's server.");
  assert.equal(modeNotice([plan()], "practice"), null);
  assert.equal(readyToastText({ title: "Ready to sign: TSLAx", body: "when TSLAx is at or below $300.00 → sell 5 shares. TSLAx is at $299.40." }), "TSLAx is at $299.40 — a plan is ready to sign.");
  assert.equal(readyToastText({ title: "Ready", body: "…" }), "A plan is ready to sign.");
  assert.equal(triggerStateLabel("pending"), "deposit landing");
  assert.equal(triggerStateLabel("pending_withdraw"), "withdrawal pending");
  assert.equal(triggerStateLabel(null), "not yet synced");
});

test("health line without a clock yet, short ids and wallets", () => {
  assert.equal(healthLine({ lastEvaluatedAt: T0 - 12_000, serverWatch: true }, null), "server watch: on");
  assert.equal(healthLine(null, null), "server watch: off · checking while this tab is open");
  assert.equal(shortWallet("9U76aBcDeFgHiJkLmNoPqRsTuVwXyZ12345vMQd"), "9U76…vMQd");
  assert.equal(shortWallet("short"), "short");
  assert.equal(shortId("abcdef0123456789wxyz"), "abcdef…wxyz");
  assert.equal(shortId("tiny"), "tiny");
});

test("Jupiter rows: the one action by order state, the mirrored line, and whose wallet it is", () => {
  const trigger = (over = {}) =>
    plan({ mode: "live", execution: "trigger", wallet: "9U76aBcDeFgHiJkLmNoPqRsTuVwXyZ12345vMQd", triggerOrderId: "order0123456789abcdef", triggerState: "open", armUntil: Date.parse("2026-10-22T12:00:00Z"), ...over });
  assert.equal(triggerAction(trigger()).kind, "cancel");
  assert.equal(triggerAction(trigger()).label, "Cancel & withdraw");
  assert.equal(triggerAction(trigger({ status: "holding" })).kind, "cancel");
  assert.equal(triggerAction(trigger({ triggerState: "pending_withdraw" })).label, "Finish withdrawal");
  assert.equal(triggerAction(trigger({ status: "expired", triggerState: "expired" })).label, "Withdraw · sign in wallet");
  assert.equal(triggerAction(trigger({ status: "done", triggerState: "filled" })), null);
  assert.equal(triggerAction(trigger({ status: "cancelled", triggerState: "cancelled" })), null);
  assert.equal(triggerAction(trigger({ status: "failed", triggerState: "failed" })), null);
  // a proposed draft never offers a cancel
  assert.equal(triggerAction(trigger({ status: "proposed", triggerState: null })), null);

  assert.equal(jupiterLine(trigger(), T0), "Jupiter order · open · order order0…cdef · expires Oct 22");
  assert.equal(jupiterLine(trigger({ triggerCheckedAt: T0 - 40_000 }), T0), "Jupiter order · open · order order0…cdef · expires Oct 22 · Jupiter status checked 40 s ago");
  assert.equal(jupiterLine(trigger({ triggerCheckedAt: T0 - 40_000 }), null), "Jupiter order · open · order order0…cdef · expires Oct 22");
  assert.equal(jupiterLine(trigger({ triggerState: null, triggerOrderId: null, armUntil: null }), T0), "Jupiter order · not yet synced");
  assert.equal(jupiterLine(trigger({ triggerState: "expired" }), T0), "Jupiter order · expired · funds still in vault · order order0…cdef · expires Oct 22");

  const otoco = trigger({ status: "holding", condition: cond({ action: { side: "buy", amountUsd: 50 }, exits: [{ kind: "target", price: 420 }, { kind: "stop", price: 280 }] }) });
  assert.equal(jupiterHoldingLine(otoco, 379.48), "holding · now $379.48 · Jupiter watching target $420.00 / stop $280.00");
  assert.equal(jupiterHoldingLine(otoco, undefined), "holding · Jupiter watching target $420.00 / stop $280.00");

  assert.equal(walletNotice(trigger(), null), "Connect 9U76…vMQd to refresh Jupiter status.");
  assert.equal(walletNotice(trigger(), "other1234567890wallet"), "armed from 9U76…vMQd");
  assert.equal(walletNotice(trigger(), "9U76aBcDeFgHiJkLmNoPqRsTuVwXyZ12345vMQd"), null);
  assert.equal(walletNotice(plan(), null), null);
});
