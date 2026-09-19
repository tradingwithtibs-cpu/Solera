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
const nacl = load("tweetnacl");
const bs58 = load("bs58").default;
const {
  generateDappKeyPair,
  deriveSharedSecret,
  encryptPayload,
  decryptPayload,
  buildConnectUrl,
  buildSignUrl,
  parseReturnParams,
  stripReturnParams,
} = load("../src/lib/phantom-deeplink.ts");

/** Phantom's side of the exchange, as its docs describe it. */
function phantom() {
  const kp = nacl.box.keyPair();
  return {
    publicKey: bs58.encode(kp.publicKey),
    reply(dappPublicKey, payload) {
      const shared = nacl.box.before(bs58.decode(dappPublicKey), kp.secretKey);
      const nonce = nacl.randomBytes(24);
      const data = nacl.box.after(new TextEncoder().encode(JSON.stringify(payload)), nonce, shared);
      return { nonce: bs58.encode(nonce), data: bs58.encode(data) };
    },
    read(dappPublicKey, nonce, payload) {
      const shared = nacl.box.before(bs58.decode(dappPublicKey), kp.secretKey);
      const opened = nacl.box.open.after(bs58.decode(payload), bs58.decode(nonce), shared);
      return JSON.parse(new TextDecoder().decode(opened));
    },
  };
}

test("connect reply decrypts with the shared secret and sign requests encrypt for Phantom", () => {
  const dapp = generateDappKeyPair();
  const ph = phantom();
  const reply = ph.reply(dapp.publicKey, { public_key: "S7vYFFWH6BjJyEsdrPQpqpYTqLTrPRK6KW3VwsJuRaS", session: "sess" });
  const shared = deriveSharedSecret(ph.publicKey, dapp.secretKey);
  const connect = decryptPayload(reply.data, reply.nonce, shared);
  assert.equal(connect.session, "sess");

  const { nonce, payload } = encryptPayload({ message: "abc", session: "sess", display: "utf8" }, shared);
  assert.deepEqual(ph.read(dapp.publicKey, nonce, payload), { message: "abc", session: "sess", display: "utf8" });

  // A tampered reply must not decrypt.
  const bad = reply.data.slice(0, -1) + (reply.data.endsWith("1") ? "2" : "1");
  assert.throws(() => decryptPayload(bad, reply.nonce, shared));
});

test("urls carry the documented parameters", () => {
  const u = new URL(
    buildConnectUrl({ dappPublicKey: "PK", appUrl: "https://trysolera.vercel.app", redirectLink: "https://trysolera.vercel.app/asset/AAPLx" }),
  );
  assert.equal(u.origin + u.pathname, "https://phantom.app/ul/v1/connect");
  assert.equal(u.searchParams.get("dapp_encryption_public_key"), "PK");
  assert.equal(u.searchParams.get("redirect_link"), "https://trysolera.vercel.app/asset/AAPLx");
  assert.equal(u.searchParams.get("cluster"), "mainnet-beta");

  const s = new URL(buildSignUrl("signTransaction", { dappPublicKey: "PK", nonce: "N", payload: "P", redirectLink: "https://x.y/z" }));
  assert.equal(s.pathname, "/ul/v1/signTransaction");
  assert.equal(s.searchParams.get("payload"), "P");
  assert.equal(s.searchParams.get("nonce"), "N");
});

test("return params are recognised, and stripped from the page url", () => {
  assert.equal(parseReturnParams("?side=sell"), null);
  assert.deepEqual(parseReturnParams("?errorCode=4001&errorMessage=User%20rejected"), {
    phantomPublicKey: undefined,
    nonce: undefined,
    data: undefined,
    errorCode: "4001",
    errorMessage: "User rejected",
  });
  const r = parseReturnParams("?phantom_encryption_public_key=PH&nonce=N&data=D");
  assert.equal(r.phantomPublicKey, "PH");
  assert.equal(stripReturnParams("https://a.b/trade/AAPLx?side=sell&nonce=N&data=D&errorCode=1"), "https://a.b/trade/AAPLx?side=sell");
});
