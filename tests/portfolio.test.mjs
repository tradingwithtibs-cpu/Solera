import { test } from "node:test";
import { createRequire } from "node:module";
const load = createRequire(import.meta.url);
import assert from "node:assert/strict";
import ts from "typescript";
import fs from "node:fs";
// Run the app's actual pure TypeScript functions without a separate test dependency.
load.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
const { applyFill, DUST_SHARES } = load("../src/lib/ledger.ts");
const { computeHoldings, computePortfolioPerformance, computeSoleraScore, isPumping } =
  load("../src/lib/portfolio.ts");
const { TICKERS } = load("../src/lib/mock-data.ts");
const { executeTrade } = load("../src/lib/trade.ts");
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function fill(side, quantity, pricePerShare = TICKERS.TSLAx.price) {
  return { ticker: "TSLAx", side, quantity, pricePerShare, totalValue: quantity * pricePerShare };
}
test("buy adds weighted cost basis and conserves balance at the fill price", () => {
  const current = { cashBalance: 1000, holdings: [{ ticker: "TSLAx", shares: 2, costBasis: 100 }] };
  const next = applyFill(current, fill("buy", 1, 200));
  near(next.holdings[0].costBasis, 400 / 3);
  near(next.cashBalance, 800);
  assert.equal(current.holdings[0].shares, 2);
  near(next.cashBalance + next.holdings[0].shares * 200, current.cashBalance + 2 * 200);
});
test("partial sell preserves cost basis; full sell removes fractional position exactly", () => {
  const current = { cashBalance: 0, holdings: [{ ticker: "TSLAx", shares: 1.1, costBasis: 215 }] };
  const partial = applyFill(current, fill("sell", 0.55));
  near(partial.holdings[0].shares, 0.55);
  assert.equal(partial.holdings[0].costBasis, 215);
  const full = applyFill(current, fill("sell", 1.1));
  assert.equal(full.holdings.length, 0);
  near(full.cashBalance, 273.262);
  const nvidia = { cashBalance: 0, holdings: [{ ticker: "NVDAx", shares: 0.8, costBasis: 150 }] };
  const exact = {
    ticker: "NVDAx",
    side: "sell",
    quantity: 0.8,
    pricePerShare: TICKERS.NVDAx.price,
    totalValue: 0.8 * TICKERS.NVDAx.price,
  };
  assert.ok(Number(exact.totalValue.toFixed(2)) > exact.totalValue);
  assert.equal(applyFill(nvidia, exact).holdings.length, 0);
  const tiny = { cashBalance: 0, holdings: [{ ticker: "TSLAx", shares: 0.001, costBasis: 200 }] };
  assert.equal(applyFill(tiny, fill("sell", 0.001)).holdings.length, 0);
});
test("oversells, overspending, nonfinite, negative and inconsistent fills are rejected", () => {
  const current = { cashBalance: 50, holdings: [{ ticker: "TSLAx", shares: 1, costBasis: 200 }] };
  for (const invalid of [
    fill("buy", 1),
    fill("sell", 2),
    fill("buy", -1),
    fill("buy", NaN),
    fill("buy", Infinity),
    { ...fill("sell", 0.1), totalValue: 1 },
    { ...fill("sell", 0.1), ticker: "INVALID" },
  ])
    assert.throws(() => applyFill(current, invalid));
  assert.equal(current.cashBalance, 50);
});
test("repeat settlement cannot overspend or sell a closed position", () => {
  const current = { cashBalance: 100, holdings: [] };
  const order = fill("buy", 1, 100);
  const next = applyFill(current, order);
  assert.throws(() => applyFill(next, order));
  const sold = applyFill(next, fill("sell", 1, 100));
  assert.throws(() => applyFill(sold, fill("sell", 1, 100)));
});
test("dust removal retains its existing threshold", () => {
  const current = { cashBalance: 0, holdings: [{ ticker: "TSLAx", shares: 1, costBasis: 200 }] };
  assert.equal(applyFill(current, fill("sell", 1 - DUST_SHARES / 2)).holdings.length, 0);
});
test("portfolio returns exclude unknown cost basis and score penalties remain unchanged", () => {
  const h = computeHoldings([
    { ticker: "TSLAx", shares: 1, costBasis: 200 },
    { ticker: "AAPLx", shares: 10 },
  ]);
  near(computePortfolioPerformance(h), ((TICKERS.TSLAx.price - 200) / 200) * 100);
  near(computeSoleraScore([{ allocationPct: 60 }], 20), 4);
  near(computeSoleraScore([{ allocationPct: 40 }], 20), 20);
  near(computePortfolioPerformance([]), 0);
  assert.equal(isPumping("TSLAx"), true);
  assert.equal(isPumping("AAPLx"), false);
});
test("mock execution rejects invalid quantities at its integration seam", async () => {
  await assert.rejects(executeTrade({ ticker: "TSLAx", side: "buy", quantity: -1 }));
  await assert.rejects(executeTrade({ ticker: "TSLAx", side: "buy", quantity: Infinity }));
});
