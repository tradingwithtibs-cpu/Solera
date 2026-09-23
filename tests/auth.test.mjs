import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import fs from "node:fs";
import { createRequire } from "node:module";
const load = createRequire(import.meta.url);
load.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    filename,
  );
load.extensions[".tsx"] = load.extensions[".ts"];
const { friendlyAuthError, validateEmailForm, PASSWORD_MIN } = load("../src/lib/auth-copy.ts");

test("Supabase Auth errors become the sheet's sentences", () => {
  assert.equal(friendlyAuthError("Invalid login credentials"), "That email and password don't match.");
  assert.equal(friendlyAuthError("User already registered"), "That email already has an account. Log in instead.");
  assert.equal(friendlyAuthError("Email not confirmed"), "Confirm the email from your inbox first, then log in.");
  assert.equal(friendlyAuthError("Password should be at least 6 characters"), `Use at least ${PASSWORD_MIN} characters.`);
  assert.equal(friendlyAuthError("Signups not allowed for this instance"), "Email sign-up isn't switched on for this deployment yet.");
  assert.equal(friendlyAuthError("Email rate limit exceeded"), "Too many tries. Wait a minute and try again.");
  assert.equal(friendlyAuthError("Something odd"), "Something odd");
});

test("the form is checked before it is sent", () => {
  assert.match(validateEmailForm("signup", { name: "T", email: "a@b.co", password: "12345678" }), /display name/);
  assert.match(validateEmailForm("login", { name: "", email: "not-an-email", password: "12345678" }), /email address/);
  assert.match(validateEmailForm("login", { name: "", email: "a@b.co", password: "short" }), /at least 8/);
  assert.equal(validateEmailForm("login", { name: "", email: " a@b.co ", password: "12345678" }), null);
  assert.equal(validateEmailForm("signup", { name: "Tibet", email: "a@b.co", password: "12345678" }), null);
});
