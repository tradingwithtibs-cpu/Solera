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
  assert.ok(out[0].spreadPct > 10 && out[0].spreadPct < 20, `spread ${out[0].spreadPct}`);
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
