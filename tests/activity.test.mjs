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
const { parseSwap, swapToFill, tokenDeltas, solDelta, knownStockMints, mergeWalletHistory } = load("../src/lib/activity.ts");

const WALLET = "9U76mo3WuP28s4kYJ9CMH1CiQh6Ph3r5Zg5awZM5vMQd";
const OTHER = "6LY1JzAFVZsP2a2xKrtU6znQMQ5h4i7tocWdgrkZzkzF";
const TSLA = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const bal = (mint, owner, amount, decimals) => ({ accountIndex: 1, mint, owner, uiTokenAmount: { amount, decimals, uiAmount: Number(amount) / 10 ** decimals } });

function tx({ pre = [], post = [], preSol = [10e9, 0], postSol = [10e9, 0], fee = 5000, err = null, blockTime = 1_790_000_000 } = {}) {
  return {
    blockTime,
    meta: { err, fee, preBalances: preSol, postBalances: postSol, preTokenBalances: pre, postTokenBalances: post },
    transaction: { signatures: ["sig111"], message: { accountKeys: [{ pubkey: WALLET }, { pubkey: OTHER }] } },
  };
}

test("a USDC-paid buy is a buy priced from the dollars that left", () => {
  const t = tx({
    pre: [bal(TSLA, WALLET, "0", 8), bal(USDC, WALLET, "1000000000", 6)],
    post: [bal(TSLA, WALLET, "200000000", 8), bal(USDC, WALLET, "300000000", 6)],
  });
  const swap = parseSwap(t, WALLET, knownStockMints(), 150);
  assert.equal(swap.side, "buy");
  assert.equal(swap.symbol, "TSLAx");
  assert.equal(swap.quantity, 2);
  assert.equal(swap.paidUsd, 700);
  const fill = swapToFill(swap, WALLET, null);
  assert.equal(fill.pricePerShare, 350);
  assert.equal(fill.totalValue, 700);
  assert.equal(fill.via, "chain");
  assert.equal(fill.signature, "sig111");
});

test("a SOL-paid sell prices the SOL that arrived, fee excluded", () => {
  const t = tx({
    pre: [bal(TSLA, WALLET, "100000000", 8)],
    post: [bal(TSLA, WALLET, "0", 8)],
    preSol: [10e9, 0],
    postSol: [12e9 - 5000, 0],
  });
  const swap = parseSwap(t, WALLET, knownStockMints(), 150);
  assert.equal(swap.side, "sell");
  assert.equal(swap.quantity, 1);
  assert.equal(Math.round(swap.paidUsd), 300);
});

test("other people's balances, failed transactions and non-stock transfers are ignored", () => {
  const someoneElse = tx({ pre: [bal(TSLA, OTHER, "0", 8)], post: [bal(TSLA, OTHER, "100000000", 8)] });
  assert.equal(parseSwap(someoneElse, WALLET, knownStockMints(), 150), null);
  const failed = tx({ err: { InstructionError: [0, "Custom"] }, pre: [bal(TSLA, WALLET, "0", 8)], post: [bal(TSLA, WALLET, "100000000", 8)] });
  assert.equal(parseSwap(failed, WALLET, knownStockMints(), 150), null);
  const usdcOnly = tx({ pre: [bal(USDC, WALLET, "0", 6)], post: [bal(USDC, WALLET, "5000000", 6)] });
  assert.equal(parseSwap(usdcOnly, WALLET, knownStockMints(), 150), null);
});

test("deltas and SOL movement are computed per wallet", () => {
  const t = tx({ pre: [bal(TSLA, WALLET, "50000000", 8)], post: [bal(TSLA, WALLET, "150000000", 8)], preSol: [5e9, 0], postSol: [4e9, 0] });
  assert.equal(tokenDeltas(t, WALLET).get(TSLA), 1);
  assert.equal(solDelta(t, WALLET), -1 + 5000 / 1e9);
  assert.equal(solDelta(t, "nobody"), 0);
});

test("mergeWalletHistory: Solera fills first when they share a signature, everything newest first", () => {
  const fill = (id, createdAt, signature, via = "ticket") => ({ id, createdAt, signature, via, mode: "live", owner: "w", wallet: "w", ticker: "TSLAx", mint: null, side: "buy", quantity: 1, pricePerShare: 1, totalValue: 1, note: null, wrongIf: null, leg: null });
  const solera = [fill("s1", 200, "sigA"), fill("s2", 50, null)];
  const chain = [fill("chain:sigA", 200, "sigA", "chain"), fill("chain:sigB", 300, "sigB", "chain"), fill("chain:sigC", 100, "sigC", "chain")];
  assert.deepEqual(mergeWalletHistory(solera, chain).map((f) => f.id), ["chain:sigB", "s1", "chain:sigC", "s2"]);
  assert.deepEqual(mergeWalletHistory([], chain).map((f) => f.id), ["chain:sigB", "chain:sigA", "chain:sigC"]);
  assert.deepEqual(mergeWalletHistory(solera, []).map((f) => f.id), ["s1", "s2"]);
});
