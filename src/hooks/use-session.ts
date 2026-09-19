"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { buildSignInMessage, type StoredSession } from "@/lib/session";
import { isDeferredSigner, stageContinuation } from "@/lib/deferred-signing";

const KEY = "solera:session";

/**
 * The wallet's sign-in for posting. One signature, stored locally for 30
 * days, sent as a bearer token to /api/chat. Kept per wallet so switching
 * wallets never posts as the previous one.
 */
let session: StoredSession | null = typeof window !== "undefined" ? read() : null;
const listeners = new Set<() => void>();

function read(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as StoredSession) : null;
    return s && s.expiresAt > Date.now() ? s : null;
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

/** Exchanges a signature over the sign-in message for a token; shared with the deeplink resumer. */
export async function completeSignIn(wallet: string, issuedAt: number, signatureBase64: string): Promise<StoredSession> {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, issuedAt, signature: signatureBase64 }),
  });
  const data = (await res.json()) as { token?: string; expiresAt?: number; error?: string };
  if (!res.ok || !data.token || !data.expiresAt) throw new Error(data.error ?? "Couldn't sign in.");
  const stored = { wallet, token: data.token, expiresAt: data.expiresAt };
  saveSession(stored);
  return stored;
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

  // A token belongs to exactly one wallet; another wallet starts signed out.
  // Expiry is enforced when the session is read from storage and by the server.
  const token = current && address && current.wallet === address ? current.token : null;

  useEffect(() => {
    // One-time nudge past the SSR `null` snapshot to whatever is in storage.
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

  return { token, signedIn: !!token, signIn, status, error, canSign: !!address && !!signMessage };
}
