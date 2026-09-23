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
const h = load("../src/components/agent/helpers.ts");

test("eyebrow: from the tools that ran, first-seen order, or composed", () => {
  assert.equal(h.eyebrowFor([]), "composed");
  assert.equal(h.eyebrowFor(undefined), "composed");
  assert.equal(h.eyebrowFor([{ name: "get_prices", ok: true, ms: 12 }]), "from live prices");
  assert.equal(h.eyebrowFor([{ name: "get_news" }]), "from news");
  assert.equal(h.eyebrowFor([{ name: "list_plans" }, { name: "cancel_plan" }, { name: "get_catalog" }]), "from your plans · the catalog");
  assert.equal(h.eyebrowFor([{ name: "create_plan" }, { name: "get_prices" }, { name: "create_plan" }]), "from your plans · live prices");
  assert.equal(h.eyebrowFor([{ name: "something_new" }]), "composed");
});

test("starters: the three canonical prompts first, the third from the live TSLAx price", () => {
  const live = h.starterChips({ tslaPrice: 379.48, live: false });
  assert.deepEqual(live.primary, ["buy AAPLx if it goes over $345", "show me the latest news on TSLAx", "if TSLAx falls to $341 sell 5 shares"]);
  assert.deepEqual(live.secondary, ["what's NVDAx at?", "my plans", "buy $50 of SPYx now"]);
  const none = h.starterChips({ tslaPrice: undefined, live: true });
  assert.equal(none.primary[2], "if TSLAx falls to $X sell 5 shares");
  assert.deepEqual(none.secondary, ["what's NVDAx at?", "my plans"], "the practice-only chip hides in live mode");
  assert.equal(h.thirdPrompt(0), "if TSLAx falls to $X sell 5 shares", "a zero price is no price");
  assert.equal(h.subtitleFor("mock"), "offline parser · no model attached yet · never signs");
  assert.equal(h.subtitleFor("anthropic"), "Claude · reads live prices, news and your plans · never signs");
});

test("ticket href carries side, size, note and via=agent", () => {
  assert.equal(h.ticketHref({ ticker: "SPYx", side: "buy", amountUsd: 50 }), "/buy/SPYx?side=buy&amount=50&via=agent");
  assert.equal(h.ticketHref({ ticker: "TSLAx", side: "sell", shares: 2 }), "/buy/TSLAx?side=sell&shares=2&via=agent");
  assert.equal(h.ticketHref({ ticker: "AAPLx", side: "buy", amountUsd: 25, note: "core & sized" }), "/buy/AAPLx?side=buy&amount=25&note=core+%26+sized&via=agent");
  assert.equal(h.ticketHref({ ticker: "SPYx", side: "buy", amountUsd: 50, shares: 3 }), "/buy/SPYx?side=buy&amount=50&via=agent", "one size only");
});

test("thread trimming keeps the last 12 turns as plain text", () => {
  const turns = Array.from({ length: 15 }, (_, i) => ({ id: String(i), role: i % 2 ? "assistant" : "user", text: `t${i}`, at: i, cards: [{ kind: "prices" }] }));
  const out = h.trimTurns(turns);
  assert.equal(out.length, 12);
  assert.deepEqual(out[0], { role: "assistant", content: "t3" });
  assert.deepEqual(out[11], { role: "user", content: "t14" });
  assert.ok(out.every((m) => Object.keys(m).join() === "role,content"), "cards never go back on the wire");
  const long = h.trimTurns([{ role: "user", text: "x".repeat(5_000) }]);
  assert.equal(long[0].content.length, h.MESSAGE_MAX);
});

test("plan card rows and the What-happens paragraphs", () => {
  const sell = { ticker: "TSLAx", trigger: { kind: "price", op: "lte", price: 300 }, action: { side: "sell", shares: 5 }, exits: [] };
  assert.equal(h.triggerDistance(379.48, 300), "(−20.9%)");
  assert.equal(h.triggerDistance(300, 345), "(+15.0%)");
  assert.equal(h.triggerDistance(0, 345), "");
  assert.equal(h.doesRow(sell, 379.48), "sell 5 shares TSLAx (≈ $1,897.40 at today's price)");
  assert.equal(h.doesRow(sell), "sell 5 shares TSLAx");
  const buy = { ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 250 }, exits: [{ kind: "target", price: 360 }, { kind: "stop", price: 330 }] };
  assert.equal(h.doesRow(buy, 231.2), "buy $250.00 of AAPLx (≈ 1.0813 shares at today's price)");
  assert.equal(h.thenRow(buy), "hold until target $360.00 or stop $330.00");
  assert.equal(h.thenRow(sell), null);
  assert.match(h.whatHappens(sell, "practice", "server"), /^Solera fills it in practice cash on its server when the price is at or below \$300\.00, checked about once a minute\./);
  assert.match(h.whatHappens(sell, "practice", "server"), /nothing is signed without your wallet\.$/);
  assert.match(h.whatHappens(sell, "live", "trigger"), /Your 5 TSLAx move to a Jupiter vault now and stay there until it fills, expires, or you cancel\. Jupiter's keepers watch 24\/7\./);
  assert.match(h.whatHappens(buy, "live", "trigger"), /Your \$250\.00 moves to a Jupiter vault now/);
  assert.equal(
    h.whatHappens({ ...sell, wrongIf: "deliveries miss" }, "live", "notify"),
    "Jupiter can't watch this one (“deliveries miss”). Solera will notify you when the price is there and prefill the ticket; you tap once to sign. Nothing is signed on your behalf.",
  );
  assert.equal(h.armedToast("when TSLAx is at or below $300.00 → sell 5 shares"), "Armed: when TSLAx is at or below $300.00 → sell 5 shares");
  assert.equal(h.notifyToast(sell), "Armed. You'll get a notification here when TSLAx is at or below $300.00.");
  assert.equal(h.armLabel({ signedIn: false, cardLive: false, toggleLive: false }), "SIGN IN TO ARM");
  assert.equal(h.armLabel({ signedIn: true, cardLive: true, toggleLive: false }), "SWITCH TO LIVE TO ARM");
  assert.equal(h.armLabel({ signedIn: true, cardLive: true, toggleLive: true }), "ARM IT");
  assert.equal(h.untilRow(sell, null), "30 days");
  assert.match(h.untilRow({ ...sell, armDays: 14 }, Date.UTC(2026, 8, 23, 12)), /^\w{3} \d{1,2}, 2026 \(14 days\)$/);
});

test("draft line, order card copy, error copy, clocks", () => {
  assert.equal(h.describeDraft({ text: "buy AAPLx if it goes over $345", condition: { ticker: "AAPLx", side: "buy", trigger: { kind: "price", op: "gte", price: 345 } } }), "buy AAPLx when at or above $345.00 · size?");
  assert.equal(h.describeDraft({ text: "buy $50 of AAPLx at 345", condition: { ticker: "AAPLx", side: "buy", action: { side: "buy", amountUsd: 50 } } }), "buy AAPLx · direction?");
  assert.equal(h.orderSentence({ ticker: "SPYx", side: "buy", amountUsd: 50 }), "buy $50.00 of SPYx at the live price");
  assert.equal(h.orderSentence({ ticker: "SPYx", side: "sell", shares: 2 }), "sell 2 shares of SPYx at the live price");
  assert.equal(h.orderSize({ amountUsd: 50 }, 773.83), "≈ 0.0646 shares");
  assert.equal(h.orderSize({ shares: 2 }, 773.83), "≈ $1,547.66");
  assert.equal(h.orderSize({ shares: 2 }, 0), "");
  assert.equal(h.errorCopy(501), "Agent isn't configured on this deployment yet.");
  assert.equal(h.errorCopy(502), "The agent isn't available right now (502). Your plans are unaffected.");
  assert.equal(h.errorCopy(null), "The agent isn't available right now (no connection). Your plans are unaffected.");
  assert.equal(h.utcClock(Date.UTC(2026, 8, 22, 12, 3, 41)), "12:03:41Z");
  assert.equal(h.relativeAge(1_000, 1_000 + 3 * 60_000), "3m ago");
  assert.equal(h.relativeAge(1_000, 1_000 + 26 * 3_600_000), "1d ago");
  assert.equal(h.relativeAge(1_000, null), "");
});
