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
const { createTriggerClient, TriggerError, describeTriggerState } = load("../src/lib/jupiter-trigger.ts");

const W = "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS";
const CHALLENGE = "Sign this message to authenticate with Jupiter that you are the owner of S7vY… expires at 2026-09-22T12:05:00Z nonce abc";

/** Replays the shapes recorded in backend.md §16 (lite-api, keyless), in the order the arm sequence calls them. */
function stubFetch(script) {
  const calls = [];
  let vaultRegistered = false;
  const fetchImpl = async (url, init = {}) => {
    const path = url.replace("https://lite-api.jup.ag/trigger/v2", "");
    const auth = init.headers?.Authorization ?? null;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method: init.method ?? "GET", auth, body });
    const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
    if (path === "/auth/challenge") return json(200, { type: "message", challenge: CHALLENGE });
    if (path === "/auth/verify") return json(200, { authMode: "message", token: script.token ?? "jwt-1" });
    if (auth !== `Bearer ${script.valid ?? "jwt-1"}`) return json(401, { error: "Unauthorized" });
    if (path === "/vault") return vaultRegistered ? json(200, { userPubkey: W, vaultPubkey: "VAULT111" }) : json(404, { error: "Vault not found" });
    if (path === "/vault/register") {
      if (vaultRegistered) return json(409, { error: "Vault already exists" });
      vaultRegistered = true;
      return json(200, { userPubkey: W, vaultPubkey: "VAULT111", privyVaultId: "pv" });
    }
    if (path === "/deposit/craft") {
      if (body.amount === "1000") return json(400, { error: "Order must be at least 10 USD (current value: 0.00 USD)", details: { amount: "too small" } });
      return json(200, { transaction: "BASE64TX", requestId: "req-1", receiverAddress: "VAULT111", amount: body.amount, tokenDecimals: 8 });
    }
    if (path === "/orders/price" && init.method === "POST") return json(200, { id: "order-1", txSignature: "SIG1", depositConfirmed: true });
    if (path.startsWith("/orders/history")) return json(200, { orders: [], pagination: { total: 0, limit: 20, offset: 0 } });
    if (path === "/orders/price/order-1/cancel") return json(200, { transaction: "WITHDRAWTX", requestId: "cancel-1" });
    if (path === "/orders/price/order-1/confirm-cancel") return json(200, { id: "order-1", txSignature: "SIG2" });
    return json(404, { error: "no route" });
  };
  return { fetchImpl, calls };
}

const wallet = (signed = []) => ({ publicKey: W, signMessage: async (bytes) => { signed.push(new TextDecoder().decode(bytes)); return new Uint8Array(64).fill(7); } });

test("auth signs the exact challenge text, caches the token per wallet, and re-authenticates on 401", async () => {
  const { fetchImpl, calls } = stubFetch({});
  let t = 1_000_000;
  const client = createTriggerClient({ fetch: fetchImpl, now: () => t });
  const signed = [];
  const w = wallet(signed);
  const token = await client.authenticate(w);
  assert.equal(token, "jwt-1");
  assert.deepEqual(signed, [CHALLENGE]);
  assert.equal(calls[0].body.walletPubkey, W);
  assert.equal(calls[0].body.type, "message");
  assert.equal(calls[1].body.type, "message");
  assert.equal(typeof calls[1].body.signature, "string");
  assert.equal(await client.authenticate(w), "jwt-1");
  assert.equal(calls.length, 2, "second call is cached");
  t += 24 * 60 * 60_000;
  await client.authenticate(w);
  assert.equal(calls.length, 4, "expired token re-authenticates");
  // a bad token → 401 → withAuth drops it and retries once
  const bad = stubFetch({ valid: "jwt-2", token: "jwt-2" });
  const c2 = createTriggerClient({ fetch: bad.fetchImpl, now: () => t });
  const seen = [];
  const out = await c2.withAuth(w, async (tok) => {
    seen.push(tok);
    if (seen.length === 1) throw new TriggerError(401, "Unauthorized");
    return "ok";
  });
  assert.equal(out, "ok");
  assert.equal(seen.length, 2);
});

test("vault: 404 → register; a repeat register's 409 reads the vault; craft errors surface Jupiter's message and details", async () => {
  const { fetchImpl, calls } = stubFetch({});
  const client = createTriggerClient({ fetch: fetchImpl });
  const token = await client.authenticate(wallet());
  assert.deepEqual(await client.ensureVault(token), { userPubkey: W, vaultPubkey: "VAULT111", privyVaultId: "pv" });
  assert.deepEqual(calls.slice(2).map((c) => c.path), ["/vault", "/vault/register"]);
  assert.equal((await client.ensureVault(token)).vaultPubkey, "VAULT111");
  const crafted = await client.craftDeposit(token, { inputMint: "SOL", outputMint: "AAPL", userAddress: W, amount: "250000000", orderType: "price", orderSubType: "single" });
  assert.equal(crafted.requestId, "req-1");
  assert.equal(crafted.receiverAddress, "VAULT111");
  await assert.rejects(client.craftDeposit(token, { inputMint: "SOL", outputMint: "AAPL", userAddress: W, amount: "1000", orderType: "price", orderSubType: "single" }), (err) => err instanceof TriggerError && err.status === 400 && /at least 10 USD/.test(err.message) && err.details.amount === "too small");
  const created = await client.createPriceOrder(token, { userPubkey: W, inputMint: "SOL", outputMint: "AAPL", inputAmount: "250000000", triggerMint: "AAPL", triggerCondition: "above", triggerPriceUsd: 345, expiresAt: "2026-10-22T00:00:00.000Z", slippageBps: 200, orderType: "price", orderSubType: "single", depositRequestId: "req-1", depositSignedTx: "SIGNED" });
  assert.deepEqual(created, { id: "order-1", txSignature: "SIG1", depositConfirmed: true });
  const sent = calls[calls.length - 1].body;
  assert.equal(sent.depositRequestId, "req-1");
  assert.equal(sent.orderSubType, "single");
  const history = await client.listOrders(token, "active");
  assert.deepEqual(history, { orders: [], pagination: { total: 0, limit: 20, offset: 0 } });
  assert.equal(calls[calls.length - 1].path, "/orders/history?state=active&limit=20&offset=0");
  const cancel = await client.initiateCancel(token, "order-1");
  assert.equal(cancel.requestId, "cancel-1");
  const confirmed = await client.confirmCancel(token, "order-1", "SIGNEDWITHDRAW", "cancel-1");
  assert.equal(confirmed.txSignature, "SIG2");
  assert.deepEqual(calls[calls.length - 1].body, { cancelRequestId: "cancel-1", signedTx: "SIGNEDWITHDRAW" });
  // a junk token is a 401 at the app level
  await assert.rejects(client.listOrders("junk", "past"), (err) => err instanceof TriggerError && err.status === 401);
  assert.equal(describeTriggerState("expired"), "expired · funds still in vault");
  assert.equal(describeTriggerState("failed", "deposit_failed"), "failed · deposit_failed");
  assert.equal(describeTriggerState("executing"), "filling…");
});
