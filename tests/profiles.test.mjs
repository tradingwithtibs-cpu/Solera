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
const { validateProfileInput, buildProfileClaimMessage, isClaimFresh, normalizeProfileInput } = load("../src/lib/profiles.ts");

test("profile validation", () => {
  assert.equal(validateProfileInput({ handle: "tibet_1", name: "Tibet", bio: "", visibility: "public" }), null);
  assert.match(validateProfileInput({ handle: "Ti", name: "x", bio: "", visibility: "public" }), /Handle/);
  assert.match(validateProfileInput({ handle: "ok_handle", name: "", bio: "", visibility: "public" }), /Name/);
  assert.match(validateProfileInput({ handle: "ok_handle", name: "x", bio: "a".repeat(161), visibility: "public" }), /Bio/);
  assert.match(validateProfileInput({ handle: "ok_handle", name: "x", bio: "", visibility: "secret" }), /public or private/);
  assert.equal(normalizeProfileInput({ handle: " TiBet ", name: " T ", bio: " b ", visibility: "public" }).handle, "tibet");
});

test("claim message is canonical and binds wallet, fields and time", () => {
  const w = "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS";
  const at = Date.UTC(2026, 8, 18, 12, 0, 0);
  const m = buildProfileClaimMessage(w, { handle: "Tibet", name: "Tibet", bio: "hi", visibility: "public" }, at);
  assert.equal(m.split("\n")[0], "Solera profile update");
  assert.ok(m.includes(`Wallet: ${w}`) && m.includes("Handle: @tibet") && m.includes("Issued: 2026-09-18T12:00:00.000Z"));
  assert.notEqual(m, buildProfileClaimMessage(w, { handle: "tibet", name: "Tibet", bio: "hi!", visibility: "public" }, at));
});

test("claims expire after five minutes and can't be far in the future", () => {
  const now = 1_800_000_000_000;
  assert.equal(isClaimFresh(now - 60_000, now), true);
  assert.equal(isClaimFresh(now - 6 * 60_000, now), false);
  assert.equal(isClaimFresh(now + 5 * 60_000, now), false);
  assert.equal(isClaimFresh(NaN, now), false);
});
