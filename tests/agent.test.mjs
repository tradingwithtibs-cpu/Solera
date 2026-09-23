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
const { TOOLS, toolSchema } = load("../src/lib/agent/tools.ts");
const { validateAgainst, strictProblems } = load("../src/lib/agent/schema.ts");
const { execute, normalizeTicker } = load("../src/lib/agent/execute.ts");
const { MockModel } = load("../src/lib/agent/mock-model.ts");
const { runAgent, buildState, toMessages, MAX_ITERATIONS } = load("../src/lib/agent/run.ts");
const { selectModelName } = load("../src/lib/agent/model.ts");
const { makeResolver } = load("../src/lib/plan-parser.ts");
const { SYSTEM_PROMPT } = load("../src/lib/agent/prompt.ts");

const resolveTicker = makeResolver([
  { symbol: "AAPLx", name: "Apple" },
  { symbol: "TSLAx", name: "Tesla" },
  { symbol: "NVDAx", name: "Nvidia" },
  { symbol: "SPYx", name: "S&P 500" },
  { symbol: "METAx", name: "Meta" },
]);
const OWNER = "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS";
const ID1 = "11111111-2222-4333-8444-555555555555";
const ID2 = "66666666-7777-4888-9999-000000000000";

function fakeDeps(over = {}) {
  const created = [];
  const cancelled = [];
  const plans = [
    { id: ID1, owner: OWNER, wallet: null, mode: "practice", execution: "server", text: "t", condition: { ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 250 }, exits: [] }, summary: "when AAPLx is at or above $345.00 → buy $250.00", status: "armed", log: [{ at: 1, from: null, to: "proposed", msg: "proposed" }, { at: 2, from: "proposed", to: "armed", msg: "armed" }], createdAt: 1 },
    { id: ID2, owner: OWNER, wallet: OWNER, mode: "live", execution: "trigger", text: "t", condition: { ticker: "TSLAx", trigger: { kind: "price", op: "lte", price: 300 }, action: { side: "sell", shares: 5 }, exits: [] }, summary: "when TSLAx is at or below $300.00 → sell 5 shares", status: "armed", log: [], createdAt: 2 },
  ];
  return {
    created,
    cancelled,
    deps: {
      prices: async (tickers) => ({ prices: Object.fromEntries(tickers.filter((t) => t !== "METAx").map((t) => [t, t === "AAPLx" ? 231.2 : 170])), fetchedAt: 1_700_000_000_000 }),
      news: async (q) => ({ items: [{ id: "1", headline: "Tesla opens a new plant", source: "Reuters", url: "https://example.com/1", publishedAt: 1_700_000_000_000 }, { id: "2", headline: "Deliveries beat estimates", source: "Bloomberg", url: "https://example.com/2", publishedAt: 1_700_000_000_000 }], source: "finnhub", fetchedAt: 1_700_000_000_000, q }),
      catalog: async () => [{ symbol: "AAPLx", name: "Apple", mint: "m1", decimals: 8 }, { symbol: "GOOGLx", name: "Alphabet", mint: "m2", decimals: 8 }],
      isTradable: async (t) => ["AAPLx", "TSLAx", "NVDAx", "SPYx", "METAx"].includes(t),
      createPlan: async (input) => {
        const plan = { id: ID1, owner: input.owner, wallet: input.wallet, mode: input.mode, execution: input.mode === "practice" ? "server" : "notify", text: input.text, source: input.source, condition: input.condition, summary: load("../src/lib/plans.ts").describe(input.condition), status: "proposed", log: [], createdAt: 3 };
        created.push(plan);
        return plan;
      },
      listPlans: async () => plans,
      getPlan: async (id) => plans.find((p) => p.id === id) ?? null,
      cancelPlan: async (plan) => {
        cancelled.push(plan.id);
        return { ...plan, status: "cancelled" };
      },
      ...over,
    },
  };
}

const ctxOf = (over = {}) => ({ owner: OWNER, wallet: null, mode: "practice", intent: "chat", openPlans: [{ n: 1, id: ID1, summary: "when AAPLx is at or above $345.00 → buy $250.00", status: "armed", mode: "practice" }, { n: 2, id: ID2, summary: "when TSLAx is at or below $300.00 → sell 5 shares", status: "armed", mode: "live" }], ...over });

async function chat(text, { ctx = ctxOf(), deps = fakeDeps().deps, history = [], pendingDraft = null, mode = "practice" } = {}) {
  const model = new MockModel({ resolveTicker });
  return runAgent(model, { messages: [...history, { role: "user", content: text }], mode, context: { page: "agent", intent: ctx.intent, pendingDraft } }, ctx, deps);
}

test("every tool schema is strict: additionalProperties false and required lists every property, recursively", () => {
  assert.equal(TOOLS.length, 8);
  for (const tool of TOOLS) {
    assert.equal(tool.strict, true, `${tool.name} strict`);
    assert.deepEqual(strictProblems(tool.input_schema), [], tool.name);
  }
  assert.equal(validateAgainst(toolSchema("get_prices"), { tickers: ["AAPLx"] }), null);
  assert.match(validateAgainst(toolSchema("get_prices"), { tickers: [] }), /at least 1/);
  assert.match(validateAgainst(toolSchema("get_prices"), { tickers: ["AAPLx"], extra: 1 }), /not a known field/);
  assert.match(validateAgainst(toolSchema("get_news"), { ticker: "TSLAx" }), /company is required/);
  assert.equal(validateAgainst(toolSchema("get_news"), { ticker: null, company: "openai" }), null);
  assert.match(validateAgainst(toolSchema("get_news"), { ticker: null, company: "acme" }), /one of/);
  assert.match(validateAgainst(toolSchema("place_practice_order"), { ticker: "AAPLx", side: "buy", amountUsd: "50", shares: null, note: null }), /number/);
  assert.equal(normalizeTicker("aapl"), "AAPLx");
  assert.equal(normalizeTicker("TSLAx"), "TSLAx");
  assert.equal(normalizeTicker("nvdaX"), "NVDAx");
  assert.match(SYSTEM_PROMPT, /You never arm or execute anything/);
});

test("prompt 1: an unsized plan asks once, then the size answer proposes the plan", async () => {
  const f = fakeDeps();
  const a = await chat("I want to buy AAPLx if it goes over $345/tokenized share", { deps: f.deps });
  assert.equal(a.model, "mock");
  assert.match(a.reply, /How much AAPLx/);
  assert.equal(a.cards.length, 0);
  assert.equal(a.pendingDraft.condition.ticker, "AAPLx");
  assert.deepEqual(a.pendingDraft.condition.trigger, { kind: "price", op: "gte", price: 345 });
  const b = await chat("$250", { deps: f.deps, pendingDraft: a.pendingDraft, history: [{ role: "user", content: "I want to buy AAPLx if it goes over $345/tokenized share" }, { role: "assistant", content: a.reply }] });
  assert.equal(b.cards.length, 1);
  assert.equal(b.cards[0].kind, "plan");
  assert.equal(b.cards[0].planId, ID1);
  assert.deepEqual(b.cards[0].condition, { ticker: "AAPLx", trigger: { kind: "price", op: "gte", price: 345 }, action: { side: "buy", amountUsd: 250 }, exits: [] });
  assert.match(b.reply, /^Proposed: when AAPLx is at or above \$345\.00 → buy \$250\.00 \(practice\)\. Tap Arm it/);
  assert.equal(b.pendingDraft, null);
  assert.equal(f.created[0].source, "agent");
  assert.deepEqual(b.toolTrace.map((t) => [t.name, t.ok]), [["create_plan", true]]);
  const c = await chat("2 shares", { deps: f.deps, pendingDraft: a.pendingDraft });
  assert.deepEqual(c.cards[0].condition.action, { side: "buy", shares: 2 });
});

test("prompt 2: news comes back as a card with headlines quoted verbatim", async () => {
  const r = await chat("Show me the latest news on TSLAx");
  assert.equal(r.cards.length, 1);
  assert.equal(r.cards[0].kind, "news");
  assert.equal(r.cards[0].ticker, "TSLAx");
  assert.equal(r.cards[0].items.length, 2);
  assert.match(r.reply, /Latest on TSLAx \(Finnhub\):\n1\. Tesla opens a new plant — Reuters\n2\. Deliveries beat estimates — Bloomberg/);
  const byName = await chat("any news about tesla?");
  assert.equal(byName.cards[0].ticker, "TSLAx");
  const pre = await chat("latest news on OpenAI");
  assert.equal(pre.cards[0].company, "openai");
  assert.match(pre.reply, /Latest on OpenAI/);
});

test("prompt 3: a sized sell plan proposes straight away; a missing direction is asked, never guessed", async () => {
  const r = await chat("If TSLAx falls to $300 sell 5 shares");
  assert.equal(r.cards[0].kind, "plan");
  assert.deepEqual(r.cards[0].condition.trigger, { kind: "price", op: "lte", price: 300 });
  assert.deepEqual(r.cards[0].condition.action, { side: "sell", shares: 5 });
  assert.match(r.reply, /Proposed: when TSLAx is at or below \$300\.00 → sell 5 shares \(practice\)/);
  const a = await chat("buy $50 of AAPLx at 345");
  assert.match(a.reply, /Above or below \$345\?/);
  assert.equal(a.cards.length, 0);
  const b = await chat("above", { pendingDraft: a.pendingDraft });
  assert.equal(b.cards[0].kind, "plan");
  assert.deepEqual(b.cards[0].condition.trigger, { kind: "price", op: "gte", price: 345 });
});

test("prices, plans, cancel, explain, immediate orders, and the help line", async () => {
  const p = await chat("what's NVDAx at?");
  assert.equal(p.cards[0].kind, "prices");
  assert.equal(p.cards[0].prices.NVDAx, 170);
  assert.match(p.reply, /NVDAx: \$170\.00 \(Jupiter, /);
  const both = await chat("price of AAPLx and METAx");
  assert.deepEqual(Object.keys(both.cards[0].prices), ["AAPLx"]);
  assert.match(both.reply, /No live price for METAx/);
  const l = await chat("my plans");
  assert.equal(l.cards[0].kind, "plans");
  assert.equal(l.cards[0].plans.length, 2);
  assert.match(l.reply, /^1\. when AAPLx is at or above \$345\.00 → buy \$250\.00 — armed \(practice\)\n2\./);
  const f = fakeDeps();
  const c = await chat("cancel the first one", { deps: f.deps });
  assert.deepEqual(f.cancelled, [ID1]);
  assert.match(c.reply, /^Cancelled: when AAPLx/);
  const t = await chat("cancel 2", { deps: f.deps });
  assert.match(t.reply, /needs your signature/);
  assert.deepEqual(f.cancelled, [ID1], "a Jupiter order is never cancelled server-side");
  const e = await chat(`explain ${ID1}`);
  assert.equal(e.cards[0].kind, "explain");
  assert.match(e.cards[0].text, /buy \$250\.00 · armed \(practice\)/);
  assert.match(e.cards[0].text, /— armed$/m);
  const o = await chat("buy $50 of SPYx now");
  assert.equal(o.cards[0].kind, "ticket");
  assert.deepEqual(o.cards[0], { kind: "ticket", ticker: "SPYx", side: "buy", amountUsd: 50, mode: "practice" });
  assert.match(o.reply, /Order: buy \$50\.00 of SPYx at the live price \(practice\)\. Review it in the ticket/);
  const o2 = await chat("buy 2 shares of SPYx");
  assert.deepEqual(o2.cards[0], { kind: "ticket", ticker: "SPYx", side: "buy", shares: 2, mode: "practice" });
  const h = await chat("write me a poem about markets");
  assert.equal(h.cards.length, 0);
  assert.match(h.reply, /I can set up price plans/);
  const pre = await execute("place_practice_order", { ticker: "OPENAI", side: "buy", amountUsd: 50, shares: null, note: null }, ctxOf(), fakeDeps().deps);
  assert.equal(pre.isError, true);
  assert.match(pre.content, /Pre-IPO tokens/);
});

test("signed out: reads work, a plan becomes a draft card that asks to sign in, plans need a session", async () => {
  const out = ctxOf({ owner: null, openPlans: [] });
  const f = fakeDeps();
  const r = await chat("if TSLAx falls to $300 sell 5 shares", { ctx: out, deps: f.deps });
  assert.equal(r.cards[0].kind, "plan");
  assert.equal(r.cards[0].planId, null);
  assert.equal(f.created.length, 0);
  assert.match(r.reply, /Sign in to keep plans running while you're away/);
  const l = await chat("my plans", { ctx: out });
  assert.equal(l.cards.length, 0);
  assert.match(l.reply, /Sign in to see your plans/);
  const n = await chat("news on NVDAx", { ctx: out });
  assert.equal(n.cards[0].kind, "news");
  const live = await chat("if TSLAx falls to $300 sell 5 shares", { ctx: ctxOf({ mode: "live", wallet: null }), mode: "live" });
  assert.match(live.reply, /Connect a wallet to arm a live plan/);
});

test("plan_preview turns only get create_plan; the state block carries mode, wallet short form and open plans", async () => {
  const ctx = ctxOf({ intent: "plan_preview", wallet: OWNER });
  const r = await chat("what's NVDAx at?", { ctx });
  assert.equal(r.cards.length, 0);
  assert.match(r.reply, /Write the plan with buy or sell/);
  const ok = await chat("buy $100 of NVDAx if it drops to 150", { ctx });
  assert.equal(ok.cards[0].kind, "plan");
  const state = buildState({ messages: [], mode: "practice", context: { pendingDraft: null } }, ctx, new Date(0));
  assert.equal(state.wallet, "S7vY…uRaS");
  assert.equal(state.openPlans.length, 2);
  assert.equal(state.intent, "plan_preview");
  const msgs = toMessages({ messages: [{ role: "assistant", content: "hi" }, { role: "user", content: "hello" }, { role: "assistant", content: "yes" }, { role: "user", content: "ok" }], mode: "practice" }, state);
  assert.equal(msgs.length, 3);
  assert.match(msgs[0].content, /^<state>\{"mode":"practice"/);
  assert.match(msgs[0].content, /\n\nhello$/);
  assert.throws(() => toMessages({ messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "there" }], mode: "practice" }, state), /Say something first/);
});

test("the loop: parallel tool results go back in one user message; six iterations is the cap; refusals and cut-offs", async () => {
  const seen = [];
  const twoTools = {
    name: "anthropic",
    async complete({ messages }) {
      seen.push(messages.map((m) => ({ role: m.role, n: typeof m.content === "string" ? 1 : m.content.length })));
      if (messages.length === 1) return { content: [{ type: "tool_use", id: "a", name: "get_prices", input: { tickers: ["AAPLx"] } }, { type: "tool_use", id: "b", name: "get_news", input: { ticker: "TSLAx", company: null } }], stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 } };
      return { content: [{ type: "text", text: "AAPLx is $231.20; two headlines below.", citations: null }], stop_reason: "end_turn", usage: { input_tokens: 20, output_tokens: 8, cache_read_input_tokens: 0 } };
    },
  };
  const r = await runAgent(twoTools, { messages: [{ role: "user", content: "aapl price and tsla news" }], mode: "practice" }, ctxOf(), fakeDeps().deps);
  assert.equal(r.model, "anthropic");
  assert.deepEqual(seen[1], [{ role: "user", n: 1 }, { role: "assistant", n: 2 }, { role: "user", n: 2 }], "both tool results in a single user message");
  assert.deepEqual(r.cards.map((c) => c.kind), ["prices", "news"]);
  assert.deepEqual(r.usage, { inputTokens: 30, outputTokens: 13, cacheReadInputTokens: 3 });
  let calls = 0;
  const forever = { name: "anthropic", async complete() { calls++; return { content: [{ type: "tool_use", id: `t${calls}`, name: "get_prices", input: { tickers: ["AAPLx"] } }], stop_reason: "tool_use" }; } };
  await assert.rejects(runAgent(forever, { messages: [{ role: "user", content: "x" }], mode: "practice" }, ctxOf(), fakeDeps().deps), /too many steps/);
  assert.equal(calls, MAX_ITERATIONS);
  const refuse = { name: "anthropic", async complete() { return { content: [], stop_reason: "refusal" }; } };
  assert.equal((await runAgent(refuse, { messages: [{ role: "user", content: "x" }], mode: "practice" }, ctxOf(), fakeDeps().deps)).reply, "I can't help with that one.");
  const cut = { name: "anthropic", async complete() { return { content: [{ type: "text", text: "…", citations: null }], stop_reason: "max_tokens" }; } };
  await assert.rejects(runAgent(cut, { messages: [{ role: "user", content: "x" }], mode: "practice" }, ctxOf(), fakeDeps().deps), /cut off/);
  const unknown = { name: "anthropic", async complete({ messages }) { return messages.length === 1 ? { content: [{ type: "tool_use", id: "u", name: "delete_everything", input: {} }], stop_reason: "tool_use" } : { content: [{ type: "text", text: String(messages[2].content[0].content), citations: null }], stop_reason: "end_turn" }; } };
  const u = await runAgent(unknown, { messages: [{ role: "user", content: "x" }], mode: "practice" }, ctxOf(), fakeDeps().deps);
  assert.match(u.reply, /Unknown tool delete_everything/);
  assert.deepEqual(u.toolTrace.map((t) => t.ok), [false]);
});

test("model selection: the key picks Claude, SOLERA_AGENT_MODEL forces either, nothing means the mock", () => {
  assert.equal(selectModelName({}), "mock");
  assert.equal(selectModelName({ ANTHROPIC_API_KEY: "k" }), "anthropic");
  assert.equal(selectModelName({ ANTHROPIC_API_KEY: "k", SOLERA_AGENT_MODEL: "mock" }), "mock");
  assert.equal(selectModelName({ SOLERA_AGENT_MODEL: "anthropic" }), "anthropic");
});
