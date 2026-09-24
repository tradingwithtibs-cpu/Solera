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
const { impliedValuation, premiumToMark, compareAcrossIssuers, formatValuation } = load("../src/lib/pre-ipo.ts");
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

const tok = (issuer, company, tokenPrice, markPrice, markValuation) => ({
  issuer, company, symbol: `${issuer}-${company}`, mint: `${issuer}-${company}`, decimals: 9,
  tokenPrice, markPrice, markValuation,
  impliedValuation: impliedValuation(tokenPrice, markPrice, markValuation),
  premiumPct: premiumToMark(tokenPrice, markPrice),
});

test("implied valuation scales the issuer's mark ratio by the live price", () => {
  // Tessera T-OpenAI: mark $812.79 ↔ $950B; trading at $974 → ≈ $1.138T
  near(impliedValuation(974, 812.79, 950e9) / 1e9, 1138.4, 0.1);
  assert.ok(Number.isNaN(impliedValuation(0, 812.79, 950e9)));
  near(premiumToMark(1050.68, 964.82), 8.899, 0.01);
  near(premiumToMark(100, 100), 0);
});

test("cross-issuer comparison orders cheapest implied valuation first and skips single-issuer companies", () => {
  const tokens = [
    tok("PreStocks", "openai", 1050.68, 964.82, 1301.7e9 / (1050.68 / 964.82)),
    tok("Tessera", "openai", 974, 812.79, 950e9),
    tok("PreStocks", "anthropic", 1006, 1012, 1650e9),
  ];
  const out = compareAcrossIssuers(tokens);
  assert.equal(out.length, 1);
  assert.equal(out[0].company.id, "openai");
  assert.equal(out[0].cheapest.issuer, "Tessera");
  assert.equal(out[0].tokens[0].issuer, "Tessera");
  assert.equal(out[0].priciest.issuer, "PreStocks");
  assert.ok(out[0].cheaperByPct > 10 && out[0].cheaperByPct < 20, `cheaperBy ${out[0].cheaperByPct}`);
  // PreStocks trades 8.9% above its mark, Tessera 19.8% above: PreStocks is the better discount-to-mark.
  assert.equal(out[0].bestDiscountToMark.issuer, "PreStocks");
  assert.ok(out[0].markDisagreementPct > 20, `marks ${out[0].markDisagreementPct}`);
});

test("valuation formatting", () => {
  assert.equal(formatValuation(1.3017e12), "$1.30T");
  assert.equal(formatValuation(31.1e9), "$31.1B");
  assert.equal(formatValuation(NaN), "—");
});

test("compact dollar formatting for liquidity", () => {
  const { formatCompactUsd } = load("../src/lib/pre-ipo.ts");
  assert.equal(formatCompactUsd(113994), "$114K");
  assert.equal(formatCompactUsd(1_250_000), "$1.3M");
  assert.equal(formatCompactUsd(42), "$42");
});

test("a company that has listed keeps its tokens but says so", () => {
  const { COMPANIES, listedSince, listedSentence } = load("../src/lib/pre-ipo.ts");
  const spacex = COMPANIES.spacex;
  assert.equal(spacex.listed.ticker, "SPCX");
  assert.equal(spacex.listed.exchange, "Nasdaq");
  assert.equal(spacex.listed.xstock, "SPCXx");
  assert.equal(listedSince(spacex.listed), "June 12, 2026");
  const sentence = listedSentence(spacex);
  assert.ok(sentence.startsWith("SpaceX has traded on Nasdaq as SPCX since June 12, 2026."), sentence);
  assert.ok(sentence.includes("do not turn into shares"), sentence);
  // Everyone else is still private.
  for (const id of Object.keys(COMPANIES)) if (id !== "spacex") assert.equal(COMPANIES[id].listed, undefined, id);
  assert.equal(listedSentence(COMPANIES.openai), null);
});

test("the listed share's xStock is a featured ticker with a Pyth pair", () => {
  const { XSTOCK_TOKENS } = load("../src/lib/tokens.ts");
  const { PYTH_FEEDS } = load("../src/lib/pyth-feeds.ts");
  const { TICKERS } = load("../src/lib/mock-data.ts");
  assert.equal(XSTOCK_TOKENS.SPCXx.decimals, 8);
  assert.equal(PYTH_FEEDS.SPCXx.equitySymbol, "SPCX");
  assert.equal(TICKERS.SPCXx.name, "SpaceX");
  // Every featured ticker has all three registrations.
  for (const t of Object.keys(XSTOCK_TOKENS)) {
    assert.ok(PYTH_FEEDS[t], `${t} has no Pyth pair`);
    assert.ok(TICKERS[t], `${t} has no curated entry`);
  }
});
