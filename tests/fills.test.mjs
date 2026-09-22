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
const { validateFillInput, validateThesis, normalizeThesis, settlePractice, rowToPublicFill } = load("../src/lib/fills.ts");
const { validateNoteInput, normalizeNoteInput } = load("../src/lib/notes.ts");

test("practice order validation", () => {
  assert.equal(validateFillInput({ ticker: "AAPLx", side: "buy", amountUsd: 25 }), null);
  assert.equal(validateFillInput({ ticker: "AAPLx", side: "sell", quantity: 0.5 }), null);
  assert.match(validateFillInput({ ticker: "AAPL", side: "buy", amountUsd: 25 }), /tokenized stock/);
  assert.match(validateFillInput({ ticker: "AAPLx", side: "hold", amountUsd: 25 }), /buy or sell/);
  assert.match(validateFillInput({ ticker: "AAPLx", side: "buy" }), /shares or a dollar amount/);
  assert.match(validateFillInput({ ticker: "AAPLx", side: "buy", amountUsd: 25, quantity: 1 }), /shares or a dollar amount/);
  assert.match(validateFillInput({ ticker: "AAPLx", side: "sell", amountUsd: 25 }), /number of shares/);
  assert.match(validateFillInput({ ticker: "AAPLx", side: "buy", amountUsd: 0.5 }), /minimum/);
  assert.match(validateFillInput({ ticker: "AAPLx", side: "buy", amountUsd: 5, note: "x".repeat(281) }), /280/);
  assert.equal(validateThesis({}), null, "the note is optional");
  assert.match(validateThesis({ leg: "up" }), /gap or mark/);
  assert.deepEqual(normalizeThesis({ note: "  core   position ", via: "copy", copiedFrom: "abc" }), { note: "core position", via: "copy", copiedFrom: "abc" });
  assert.equal(normalizeThesis({}).via, "ticket");
});

test("settlePractice prices the order and applies the ledger rules", () => {
  const row = { owner: "o", cash: 100, holdings: [], version: 3, updatedAt: 0 };
  const buy = settlePractice(row, { ticker: "AAPLx", side: "buy", amountUsd: 50, price: 200 }, 1000);
  assert.equal(buy.row.version, 4);
  assert.ok(Math.abs(buy.row.cash - 50) < 1e-9);
  assert.equal(buy.row.holdings[0].ticker, "AAPLx");
  assert.ok(Math.abs(buy.row.holdings[0].shares - 0.25) < 1e-12);
  assert.equal(buy.fill.pricePerShare, 200);
  assert.ok(Math.abs(buy.fill.totalValue - 50) < 1e-9);
  const sell = settlePractice(buy.row, { ticker: "AAPLx", side: "sell", quantity: 0.25, price: 220 }, 2000);
  assert.equal(sell.row.holdings.length, 0);
  assert.ok(Math.abs(sell.row.cash - 105) < 1e-9);
  assert.throws(() => settlePractice(row, { ticker: "AAPLx", side: "buy", amountUsd: 500, price: 200 }, 0), /cash changed/);
  assert.throws(() => settlePractice(row, { ticker: "AAPLx", side: "sell", quantity: 1, price: 200 }, 0), /position changed/);
  assert.throws(() => settlePractice(row, { ticker: "AAPLx", side: "buy", amountUsd: 5, price: 0 }, 0), /No live price/);
});

test("public fills and notes", () => {
  const f = rowToPublicFill({ id: "1", owner: "o", wallet: null, ticker: "TSLAx", side: "buy", quantity: "1.5", price_per_share: "300", total_value: "450", note: "why", created_at: "2026-09-22T00:00:00Z" }, "practice");
  assert.equal(f.mode, "practice");
  assert.equal(f.quantity, 1.5);
  assert.equal(f.via, "ticket");
  assert.equal(validateNoteInput({ key: "AAPLx", note: "ok" }), null);
  assert.match(validateNoteInput({ key: "../x" }), /Unknown position/);
  assert.match(validateNoteInput({ key: "AAPLx", horizon: "x".repeat(25) }), /horizon/);
  const n = normalizeNoteInput({ key: "AAPLx", note: "  hold  it " }, undefined, 5);
  assert.deepEqual(n, { key: "AAPLx", note: "hold it", horizon: "", wrongIf: "", wrongHitAt: null, pinned: false, sortOrder: 0, updatedAt: 5 });
  const merged = normalizeNoteInput({ key: "AAPLx", pinned: true }, n, 6);
  assert.equal(merged.note, "hold it");
  assert.equal(merged.pinned, true);
});
