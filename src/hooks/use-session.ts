"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { buildSignInMessage, type StoredSession } from "@/lib/session";
import { isDeferredSigner, stageContinuation } from "@/lib/deferred-signing";

const KEY = "solera:session";

/**
 * The signed-in session for posting, voting, notes and plans. One token,
 * stored locally for 30 days, sent as a bearer to the app's routes. A
 * wallet session counts only while that wallet is the connected one; an
 * email session counts on its own.
 */
let session: StoredSession | null = typeof window !== "undefined" ? read() : null;
const listeners = new Set<() => void>();

function read(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<StoredSession>) : null;
    if (!s || typeof s.token !== "string" || typeof s.expiresAt !== "number" || s.expiresAt <= Date.now()) return null;
    // Sessions saved before email accounts existed carried only `wallet`.
    const owner = s.owner ?? s.wallet;
    if (!owner) return null;
    return { owner, kind: s.kind ?? "wallet", wallet: s.wallet, token: s.token, expiresAt: s.expiresAt };
  } catch {
    return null;
  }
}

export function saveSession(next: StoredSession | null) {
  session = next;
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the session just lasts until reload.
  }
  listeners.forEach((l) => l());
}

export function getStoredSession(): StoredSession | null {
  return session;
}

interface SessionResponse {
  token?: string;
  owner?: string;
  kind?: "wallet" | "user";
  wallet?: string | null;
  expiresAt?: number;
  error?: string;
}

async function exchange(body: object): Promise<StoredSession> {
  const res = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json()) as SessionResponse;
  if (!res.ok || !data.token || !data.expiresAt || !data.owner) throw new Error(data.error ?? "Couldn't sign in.");
  const stored: StoredSession = { owner: data.owner, kind: data.kind ?? "wallet", wallet: data.wallet ?? undefined, token: data.token, expiresAt: data.expiresAt };
  saveSession(stored);
  return stored;
}

/** Exchanges a wallet signature over the sign-in message for a token; shared with the deeplink resumer. */
export async function completeSignIn(wallet: string, issuedAt: number, signatureBase64: string): Promise<StoredSession> {
  return exchange({ wallet, issuedAt, signature: signatureBase64 });
}

/** Exchanges a Supabase Auth access token (email account) for a token. */
export async function completeEmailSignIn(supabaseAccessToken: string): Promise<StoredSession> {
  return exchange({ supabaseAccessToken });
}

export function useSession() {
  const { publicKey, signMessage, wallet: connected } = useWallet();
  const address = publicKey?.toBase58() ?? null;
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => session,
    () => null,
  );
  const [status, setStatus] = useState<"idle" | "signing">("idle");
  const [error, setError] = useState<string | null>(null);

  // A wallet session belongs to exactly one wallet; an email session stands on its own.
  const valid = !!current && (current.kind === "user" || (!!address && current.wallet === address));
  const token = valid ? current!.token : null;

  useEffect(() => {
    listeners.forEach((l) => l());
  }, []);

  const signIn = useCallback(async () => {
    if (!address || !signMessage) {
      setError("Connect a wallet that can sign messages first.");
      return;
    }
    setError(null);
    setStatus("signing");
    try {
      const issuedAt = Date.now();
      // On iOS Safari the signature comes back on a fresh page load; DeepLinkResumer finishes the sign-in.
      if (isDeferredSigner(connected?.adapter)) stageContinuation({ kind: "session", wallet: address, issuedAt });
      const sig = await signMessage(new TextEncoder().encode(buildSignInMessage(address, issuedAt)));
      await completeSignIn(address, issuedAt, Buffer.from(sig).toString("base64"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(/user rejected|rejected the request/i.test(message) ? "You cancelled the signature." : message);
    } finally {
      setStatus("idle");
    }
  }, [address, signMessage, connected]);

  const signOut = useCallback(() => saveSession(null), []);

  return {
    token,
    signedIn: !!token,
    owner: valid ? current!.owner : null,
    kind: valid ? current!.kind : null,
    signIn,
    signOut,
    status,
    error,
    canSign: !!address && !!signMessage,
  };
}
