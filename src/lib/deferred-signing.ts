import type { SettlementCurrency } from "./tokens";
import type { ProfileInput } from "./profiles";
import type { TickerSymbol, TradeSide } from "./types";

/**
 * Signing through a deeplink means leaving the page: Phantom opens, the
 * user approves, and Safari comes back to a fresh page load. Whatever we
 * were in the middle of has to survive that round trip in localStorage.
 *
 * The contract is small: right before asking a deferred wallet to sign,
 * the caller stages a continuation saying what to do with the signature.
 * The adapter attaches it to the pending request when it redirects, and
 * DeepLinkResumer finishes the job when the response lands.
 */
export type Continuation =
  | {
      kind: "swap";
      requestId: string;
      inputMint: string;
      outputMint: string;
      inDecimals: number;
      outDecimals: number;
      inAmount: string;
      outAmount: string;
      inUsd?: number;
      outUsd?: number;
      payWith: SettlementCurrency;
      wallet: string;
      trade:
        | {
            kind: "xstock";
            ticker: TickerSymbol;
            side: TradeSide;
            copiedFromInvestorId?: string;
            note?: string;
            wrongIf?: string;
            leg?: "gap" | "mark";
            via?: "ticket" | "plan" | "agent" | "copy";
            planId?: string;
          }
        | { kind: "pre-ipo"; symbol: string; name: string };
    }
  | { kind: "profile"; wallet: string; profile: ProfileInput; issuedAt: number }
  | { kind: "session"; wallet: string; issuedAt: number };

export interface PendingRequest {
  id: string;
  request: "connect" | "signTransaction" | "signMessage";
  /** Full URL to restore after the round trip (the redirect drops the query string). */
  returnTo: string;
  createdAt: number;
  continuation?: Continuation;
}

export interface DeepLinkResult {
  id: string;
  request: PendingRequest["request"];
  /** base58 signed transaction, base58 signature, or the connected wallet address. */
  payload?: string;
  error?: string;
}

export const PENDING_KEY = "solera:deeplink-pending";
export const RESULT_KEY = "solera:deeplink-result";
/** A round trip that hasn't come back in this long is abandoned. */
export const PENDING_MAX_AGE_MS = 15 * 60_000;

let staged: Continuation | null = null;

/** Called by trade/profile/session code right before a deferred sign. */
export function stageContinuation(c: Continuation) {
  staged = c;
}

export function takeStagedContinuation(): Continuation | undefined {
  const c = staged ?? undefined;
  staged = null;
  return c;
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the round trip simply can't be resumed.
  }
}

export function savePending(p: PendingRequest) {
  write(PENDING_KEY, p);
}
export function readPending(): PendingRequest | null {
  const p = read<PendingRequest>(PENDING_KEY);
  if (p && Date.now() - p.createdAt > PENDING_MAX_AGE_MS) {
    write(PENDING_KEY, null);
    return null;
  }
  return p;
}
export function clearPending() {
  write(PENDING_KEY, null);
}
export function saveResult(r: DeepLinkResult) {
  write(RESULT_KEY, r);
}
export function readResult(): DeepLinkResult | null {
  return read<DeepLinkResult>(RESULT_KEY);
}
export function clearResult() {
  write(RESULT_KEY, null);
}

/** A wallet-adapter that signs by leaving the page. */
export function isDeferredSigner(adapter: unknown): boolean {
  return !!adapter && typeof adapter === "object" && (adapter as { deferred?: boolean }).deferred === true;
}

export function newRequestId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
