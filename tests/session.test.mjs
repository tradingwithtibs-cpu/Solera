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
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
const { issueSessionToken, verifySessionToken, sessionFromHeader } = load("../src/lib/session-server.ts");
const { buildSignInMessage, SESSION_TTL_MS } = load("../src/lib/session.ts");
const { validateMessageBody, normalizeMessageBody, isValidRoom, mergeMessages } = load("../src/lib/chat.ts");

const W = "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS";

test("session tokens round-trip, expire, and can't be forged", () => {
  const now = Date.UTC(2026, 8, 18);
  const { token, expiresAt } = issueSessionToken(W, now);
  assert.equal(expiresAt, now + SESSION_TTL_MS);
  assert.deepEqual(verifySessionToken(token, now + 1000), { wallet: W, expiresAt });
  assert.equal(verifySessionToken(token, expiresAt + 1), null);
  assert.equal(verifySessionToken(token.slice(0, -2) + "zz", now), null);
  // Same MAC, different wallet in the payload: rejected.
  const mac = token.split(".")[1];
  const forged = Buffer.from(JSON.stringify({ w: "attacker", exp: expiresAt })).toString("base64url") + "." + mac;
  assert.equal(verifySessionToken(forged, now), null);
  assert.equal(sessionFromHeader(`Bearer ${token}`)?.wallet, W);
  assert.equal(sessionFromHeader("Basic abc"), null);
  assert.equal(sessionFromHeader(null), null);
});

test("sign-in message names the wallet and the time, and says what it can't do", () => {
  const m = buildSignInMessage(W, Date.UTC(2026, 8, 18, 12));
  assert.equal(m.split("\n")[0], "Sign in to Solera");
  assert.ok(m.includes(`Wallet: ${W}`) && m.includes("Issued: 2026-09-18T12:00:00.000Z") && /cannot move funds/.test(m));
});

test("chat validation", () => {
  const bell = String.fromCharCode(7);
  assert.equal(validateMessageBody("  hello   there \n"), null);
  assert.equal(normalizeMessageBody(`  hello ${bell}  there \n`), "hello there");
  assert.match(validateMessageBody("   "), /Write something/);
  assert.match(validateMessageBody("x".repeat(281)), /280/);
  assert.ok(isValidRoom("AAPLx") && isValidRoom("BRK.Bx") && !isValidRoom("aaplx") && !isValidRoom("AAPL") && !isValidRoom("../x"));
  const a = { id: "2", room: "AAPLx", wallet: W, body: "b", createdAt: 2 };
  const b = { id: "1", room: "AAPLx", wallet: W, body: "a", createdAt: 1 };
  const merged = mergeMessages([a], [b, { ...a, body: "b2" }]);
  assert.deepEqual(
    merged.map((m) => m.id),
    ["1", "2"],
  );
  assert.equal(merged[1].body, "b2");
});
