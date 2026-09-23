import bs58 from "bs58";
import type { PriceOrderBody, TriggerSubType } from "./jupiter-trigger-map";

/**
 * Jupiter Trigger V2 from the browser (docs/port/backend.md §9.4–9.7). The
 * JWT is bound to a wallet signature, so it lives here in memory and never
 * touches storage; the server never sees it. Every call takes an injected
 * fetch so tests replay the recorded shapes. Paths follow the Trigger V2
 * docs; the ones marked "unverified" were not exercised live (no funds).
 */
export const TRIGGER_BASE = "https://lite-api.jup.ag/trigger/v2";
const JWT_TTL_MS = 24 * 60 * 60_000;
const JWT_SLACK_MS = 60_000;

export interface TriggerWallet {
  publicKey: string;
  signMessage(bytes: Uint8Array): Promise<Uint8Array>;
}

export interface TriggerChallenge {
  type: string;
  challenge: string;
}

export interface CraftDepositBody {
  inputMint: string;
  outputMint: string;
  userAddress: string;
  amount: string;
  orderType: "price";
  orderSubType: TriggerSubType;
}

export interface CraftedDeposit {
  transaction: string;
  requestId: string;
  receiverAddress: string;
  amount: string;
  tokenDecimals: number;
}

export interface CreatedOrder {
  id: string;
  txSignature: string;
  depositConfirmed: boolean;
}

export type TriggerOrderState = "pending" | "open" | "executing" | "filled" | "pending_withdraw" | "cancelled" | "expired" | "failed";

export interface TriggerOrder {
  id: string;
  orderState: TriggerOrderState | string;
  inputMint?: string;
  outputMint?: string;
  triggerPriceUsd?: number;
  expiresAt?: string;
  events?: Array<{ type: string; txSignature?: string; inputUsed?: string; outputAmount?: string; reason?: string; timestamp?: string }>;
  [key: string]: unknown;
}

export interface OrdersHistory {
  orders: TriggerOrder[];
  pagination?: { total: number; limit: number; offset: number };
}

export class TriggerError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TriggerError";
  }
}

/** Jupiter's order-state words the way the plan row says them (agent-ux §2.3). */
export function describeTriggerState(state: string | null | undefined, reason?: string): string {
  switch (state) {
    case "pending":
      return "deposit landing";
    case "open":
      return "open";
    case "executing":
      return "filling…";
    case "filled":
      return "filled";
    case "pending_withdraw":
      return "withdrawal pending";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired · funds still in vault";
    case "failed":
      return reason ? `failed · ${reason}` : "failed";
    default:
      return state ? String(state) : "unknown";
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createTriggerClient(opts: { fetch?: FetchLike; base?: string; now?: () => number } = {}) {
  const fetchImpl: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  const base = opts.base ?? TRIGGER_BASE;
  const now = opts.now ?? (() => Date.now());
  const jwts = new Map<string, { token: string; exp: number }>();

  async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json", ...((init.headers as Record<string, string>) ?? {}) };
    if (init.body) headers["Content-Type"] = "application/json";
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    const res = await fetchImpl(`${base}${path}`, { ...init, headers });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const b = (body ?? {}) as { error?: string; message?: string; details?: Record<string, unknown> };
      throw new TriggerError(res.status, b.error ?? b.message ?? `Jupiter answered ${res.status}`, b.details);
    }
    return body as T;
  }

  /** Step 1 of authentication, separated so the arm sheet can show the text before the wallet prompt. */
  async function getChallenge(wallet: string): Promise<TriggerChallenge> {
    return call<TriggerChallenge>("/auth/challenge", { method: "POST", body: JSON.stringify({ walletPubkey: wallet, type: "message" }) });
  }

  function cachedToken(wallet: string): string | null {
    const hit = jwts.get(wallet);
    return hit && hit.exp - JWT_SLACK_MS > now() ? hit.token : null;
  }

  /** challenge → signMessage → verify → a 24 h token, cached per wallet in memory. */
  async function authenticate(wallet: TriggerWallet, challenge?: TriggerChallenge): Promise<string> {
    const cached = cachedToken(wallet.publicKey);
    if (cached) return cached;
    const c = challenge ?? (await getChallenge(wallet.publicKey));
    const signature = await wallet.signMessage(new TextEncoder().encode(c.challenge));
    const res = await call<{ authMode: string; token: string }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ type: "message", walletPubkey: wallet.publicKey, signature: bs58.encode(signature) }),
    });
    if (!res.token) throw new TriggerError(401, "Jupiter didn't return a token.");
    jwts.set(wallet.publicKey, { token: res.token, exp: now() + JWT_TTL_MS });
    return res.token;
  }

  function forget(wallet: string) {
    jwts.delete(wallet);
  }

  /** A token that crossed a page load (the iOS deposit hop) or came from another tab. */
  function remember(wallet: string, token: string, exp: number) {
    jwts.set(wallet, { token, exp });
  }

  function tokenExpiry(wallet: string): number | null {
    return jwts.get(wallet)?.exp ?? null;
  }

  /** Verifies a signature the wallet produced elsewhere (a deeplink round trip) and caches the token. */
  async function verifySignature(wallet: string, signature: Uint8Array): Promise<{ token: string; exp: number }> {
    const res = await call<{ authMode: string; token: string }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ type: "message", walletPubkey: wallet, signature: bs58.encode(signature) }),
    });
    if (!res.token) throw new TriggerError(401, "Jupiter didn't return a token.");
    const exp = now() + JWT_TTL_MS;
    jwts.set(wallet, { token: res.token, exp });
    return { token: res.token, exp };
  }

  /** Runs `fn` with the wallet's token; on a 401 the token is dropped and the call is retried once with a fresh one. */
  async function withAuth<T>(wallet: TriggerWallet, fn: (token: string) => Promise<T>): Promise<T> {
    const token = await authenticate(wallet);
    try {
      return await fn(token);
    } catch (err) {
      if (err instanceof TriggerError && err.status === 401) {
        forget(wallet.publicKey);
        return fn(await authenticate(wallet));
      }
      throw err;
    }
  }

  /** GET /vault, registering one on 404 (no signature). 409 on a repeat register means it exists: read it again. */
  async function ensureVault(token: string): Promise<{ vaultPubkey: string }> {
    try {
      return await call<{ vaultPubkey: string }>("/vault", { token });
    } catch (err) {
      if (!(err instanceof TriggerError) || err.status !== 404) throw err;
    }
    try {
      return await call<{ vaultPubkey: string }>("/vault/register", { token });
    } catch (err) {
      if (err instanceof TriggerError && err.status === 409) return call<{ vaultPubkey: string }>("/vault", { token });
      throw err;
    }
  }

  async function craftDeposit(token: string, body: CraftDepositBody): Promise<CraftedDeposit> {
    return call<CraftedDeposit>("/deposit/craft", { method: "POST", token, body: JSON.stringify(body) });
  }

  async function createPriceOrder(token: string, body: PriceOrderBody & { depositRequestId: string; depositSignedTx: string }): Promise<CreatedOrder> {
    return call<CreatedOrder>("/orders/price", { method: "POST", token, body: JSON.stringify(body) });
  }

  async function listOrders(token: string, state: "active" | "past", limit = 20, offset = 0): Promise<OrdersHistory> {
    return call<OrdersHistory>(`/orders/history?state=${state}&limit=${limit}&offset=${offset}`, { token });
  }

  /** Unverified live: per docs/trigger/manage-orders.md the cancel is two steps; the withdrawal transaction comes back to sign. */
  async function initiateCancel(token: string, orderId: string): Promise<{ transaction: string; requestId: string }> {
    return call<{ transaction: string; requestId: string }>(`/orders/price/${encodeURIComponent(orderId)}/cancel`, { method: "POST", token, body: JSON.stringify({}) });
  }

  /** Unverified live; idempotent per the docs when retried with the same request id. */
  async function confirmCancel(token: string, orderId: string, signedTx: string, cancelRequestId: string): Promise<{ id: string; txSignature: string }> {
    return call<{ id: string; txSignature: string }>(`/orders/price/${encodeURIComponent(orderId)}/confirm-cancel`, {
      method: "POST",
      token,
      body: JSON.stringify({ cancelRequestId, signedTx }),
    });
  }

  /** Unverified live: the docs list expiry as editable. If Jupiter rejects the field, the panel hides EXTEND (agent-ux §2.3). */
  async function extendOrder(token: string, orderId: string, expiresAt: string): Promise<{ id: string }> {
    return call<{ id: string }>(`/orders/price/${encodeURIComponent(orderId)}`, { method: "PATCH", token, body: JSON.stringify({ expiresAt }) });
  }

  return { getChallenge, authenticate, verifySignature, cachedToken, remember, tokenExpiry, forget, withAuth, ensureVault, craftDeposit, createPriceOrder, listOrders, initiateCancel, confirmCancel, extendOrder };
}

export type TriggerClient = ReturnType<typeof createTriggerClient>;

let shared: TriggerClient | null = null;
/** The app's one client (one JWT cache per tab). */
export function getTriggerClient(): TriggerClient {
  shared ??= createTriggerClient();
  return shared;
}
