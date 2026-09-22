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
const { walletToInvestor, avatarColorFor, weightedTrailingChangePct } = load("../src/lib/investors.ts");
const { TICKERS } = load("../src/lib/mock-data.ts");
const { trailingChangePct } = load("../src/lib/portfolio.ts");
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

const ADDR = "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS";

test("a wallet becomes an investor with a stable identity and no invented facts", () => {
  const inv = walletToInvestor({ address: ADDR, holdings: [{ ticker: "AAPLx", shares: 2 }, { ticker: "TSLAx", shares: 1 }] });
  assert.equal(inv.id, ADDR);
  assert.equal(inv.kind, "wallet");
  assert.equal(inv.name, "S7vY…uRaS");
  assert.equal(inv.walletAddress, ADDR);
  assert.equal(inv.holdings.length, 2);
  assert.equal(avatarColorFor(ADDR), avatarColorFor(ADDR));
  assert.match(avatarColorFor(ADDR), /^var\(--color-tk-/);
});

test("performance is the value-weighted trailing move of what's held", () => {
  const solo = weightedTrailingChangePct([{ ticker: "TSLAx", shares: 3 }]);
  near(solo, trailingChangePct("TSLAx"));
  const a = TICKERS.AAPLx.price, t = TICKERS.TSLAx.price;
  const mixed = weightedTrailingChangePct([{ ticker: "AAPLx", shares: 1 }, { ticker: "TSLAx", shares: 1 }]);
  near(mixed, (a * trailingChangePct("AAPLx") + t * trailingChangePct("TSLAx")) / (a + t));
  assert.equal(weightedTrailingChangePct([]), 0);
});
