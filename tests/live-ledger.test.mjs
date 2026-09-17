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
const { costBasisFromTrades } = load("../src/lib/live-ledger.ts");
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

const t = (side, ticker, quantity, totalValue, timestamp) => ({ id: `${timestamp}`, side, ticker, quantity, pricePerShare: totalValue / quantity, totalValue, timestamp });

test("average cost basis across buys, unchanged by sells, gone when fully sold", () => {
  // Newest first, as the ledger stores them.
  const trades = [
    t("sell", "AAPLx", 1, 400, 3),
    t("buy", "AAPLx", 1, 300, 2),
    t("buy", "AAPLx", 1, 100, 1),
  ];
  near(costBasisFromTrades(trades).AAPLx, 200);
  near(costBasisFromTrades(trades.slice(1)).AAPLx, 200);
  assert.equal(costBasisFromTrades([t("sell", "AAPLx", 2, 800, 4), ...trades.slice(1)]).AAPLx, undefined);
  assert.equal(costBasisFromTrades([t("sell", "TSLAx", 1, 10, 1)]).TSLAx, undefined);
});
