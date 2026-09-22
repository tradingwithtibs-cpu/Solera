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
const { ownerKind, isOwner, isWalletAddress } = load("../src/lib/owner.ts");

test("owner strings: wallets and auth user ids, nothing else", () => {
  assert.equal(ownerKind("S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS"), "wallet");
  assert.equal(ownerKind("3f2c9d1e-5b6a-4c7d-8e9f-0a1b2c3d4e5f"), "user");
  assert.equal(ownerKind("3F2C9D1E-5B6A-4C7D-8E9F-0A1B2C3D4E5F"), null, "uuids are lowercase");
  assert.equal(ownerKind("0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl"), null, "base58 has no 0 O I l");
  assert.equal(ownerKind("short"), null);
  assert.equal(ownerKind("wallet:S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS"), null, "no prefixes");
  assert.equal(isOwner(42), false);
  assert.equal(isWalletAddress("3f2c9d1e-5b6a-4c7d-8e9f-0a1b2c3d4e5f"), false);
});
