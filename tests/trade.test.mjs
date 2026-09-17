import { test } from "node:test";
import { createRequire } from "node:module";
const load = createRequire(import.meta.url);
import assert from "node:assert/strict";
import ts from "typescript";
import fs from "node:fs";
load.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
const { toBaseUnits, fromBaseUnits, tickerForMint, XSTOCK_TOKENS, USDC } = load("../src/lib/tokens.ts");
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("base-unit conversion is exact and never rounds spend upward", () => {
  assert.equal(toBaseUnits(1.5, USDC.decimals), "1500000");
  assert.equal(toBaseUnits(0.1, 8), "10000000");
  assert.equal(toBaseUnits(12.3456789, USDC.decimals), "12345678");
  assert.equal(toBaseUnits(0, 6), "0");
  near(fromBaseUnits("295397", 8), 0.00295397);
  near(fromBaseUnits("1500000", 6), 1.5);
  assert.throws(() => toBaseUnits(-1, 6));
  assert.throws(() => toBaseUnits(NaN, 6));
});

test("every ticker maps to a Token-2022 mint with 8 decimals and back", () => {
  for (const [ticker, info] of Object.entries(XSTOCK_TOKENS)) {
    assert.equal(info.decimals, 8);
    assert.equal(tickerForMint(info.mint), ticker);
  }
  assert.equal(tickerForMint(USDC.mint), undefined);
});
