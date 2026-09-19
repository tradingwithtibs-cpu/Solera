import nacl from "tweetnacl";
import bs58 from "bs58";

/**
 * Phantom's deeplink protocol, the one way a page in Safari on iPhone can
 * talk to the Phantom app without leaving Safari: each request is a
 * universal link into Phantom, and Phantom answers by opening our
 * `redirect_link` back in Safari with the response in the query string.
 * Everything after `connect` is encrypted with a shared secret derived
 * from an x25519 key exchange (NaCl box). Pure functions only; the
 * adapter in phantom-deeplink-adapter.ts does the navigation and storage.
 *
 * Docs: https://docs.phantom.com/phantom-deeplinks
 */
const BASE = "https://phantom.app/ul/v1";

export type DeepLinkRequest = "connect" | "signTransaction" | "signMessage";

export interface DappKeyPair {
  /** base58 */
  publicKey: string;
  /** base58 */
  secretKey: string;
}

export function generateDappKeyPair(): DappKeyPair {
  const kp = nacl.box.keyPair();
  return { publicKey: bs58.encode(kp.publicKey), secretKey: bs58.encode(kp.secretKey) };
}

/** The shared secret both sides derive: our secret key with Phantom's public key. */
export function deriveSharedSecret(phantomPublicKey: string, dappSecretKey: string): Uint8Array {
  return nacl.box.before(bs58.decode(phantomPublicKey), bs58.decode(dappSecretKey));
}

export function encryptPayload(payload: unknown, sharedSecret: Uint8Array): { nonce: string; payload: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box.after(new TextEncoder().encode(JSON.stringify(payload)), nonce, sharedSecret);
  return { nonce: bs58.encode(nonce), payload: bs58.encode(box) };
}

export function decryptPayload<T>(data: string, nonce: string, sharedSecret: Uint8Array): T {
  const opened = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), sharedSecret);
  if (!opened) throw new Error("Could not decrypt Phantom's response.");
  return JSON.parse(new TextDecoder().decode(opened)) as T;
}

export function buildConnectUrl(params: { dappPublicKey: string; appUrl: string; redirectLink: string }): string {
  const q = new URLSearchParams({
    app_url: params.appUrl,
    dapp_encryption_public_key: params.dappPublicKey,
    redirect_link: params.redirectLink,
    cluster: "mainnet-beta",
  });
  return `${BASE}/connect?${q}`;
}

export function buildSignUrl(
  method: "signTransaction" | "signMessage",
  params: { dappPublicKey: string; nonce: string; payload: string; redirectLink: string },
): string {
  const q = new URLSearchParams({
    dapp_encryption_public_key: params.dappPublicKey,
    nonce: params.nonce,
    redirect_link: params.redirectLink,
    payload: params.payload,
  });
  return `${BASE}/${method}?${q}`;
}

export interface ReturnParams {
  /** Only on a connect response. */
  phantomPublicKey?: string;
  nonce?: string;
  data?: string;
  errorCode?: string;
  errorMessage?: string;
}

const RETURN_KEYS = ["phantom_encryption_public_key", "nonce", "data", "errorCode", "errorMessage"];

/** Phantom's response, if this query string is one; null for an ordinary page load. */
export function parseReturnParams(search: string): ReturnParams | null {
  const q = new URLSearchParams(search);
  if (!q.has("data") && !q.has("errorCode")) return null;
  return {
    phantomPublicKey: q.get("phantom_encryption_public_key") ?? undefined,
    nonce: q.get("nonce") ?? undefined,
    data: q.get("data") ?? undefined,
    errorCode: q.get("errorCode") ?? undefined,
    errorMessage: q.get("errorMessage") ?? undefined,
  };
}

/** The same URL without Phantom's response parameters. */
export function stripReturnParams(href: string): string {
  const url = new URL(href);
  for (const key of RETURN_KEYS) url.searchParams.delete(key);
  return url.toString();
}

export interface ConnectResponse {
  public_key: string;
  session: string;
}
export interface SignTransactionResponse {
  /** base58 signed, serialized transaction */
  transaction: string;
}
export interface SignMessageResponse {
  /** base58 signature */
  signature: string;
}

export const toBase58 = (bytes: Uint8Array) => bs58.encode(bytes);
export const fromBase58 = (text: string) => bs58.decode(text);
