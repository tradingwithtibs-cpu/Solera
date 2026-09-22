"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { MY_CASH_BALANCE } from "@/lib/mock-data";
import { useSession } from "./use-session";
import type { PracticeRow } from "@/lib/fills";
import { isKnownTicker } from "@/lib/catalog";
import type {
  HoldingPosition,
  OptionContract,
  OptionPosition,
  OptionTransaction,
  TickerSymbol,
  TradeSide,
  Transaction,
} from "@/lib/types";

import { applyFill, applyOptionsFill } from "@/lib/ledger";
import { contractCost } from "@/lib/options";

const STORAGE_KEY = "stocklana:portfolio";

interface PortfolioState {
  cashBalance: number;
  holdings: HoldingPosition[];
  transactions: Transaction[];
  /** Options positions and activity — see lib/types.ts for why these are
   * kept separate from equity holdings/transactions rather than merged in. */
  optionPositions: OptionPosition[];
  optionTransactions: OptionTransaction[];
}

function defaultState(): PortfolioState {
  return {
    cashBalance: MY_CASH_BALANCE,
    // A new visitor starts with cash and no positions (decision: no pre-loaded holdings).
    holdings: [],
    transactions: [],
    optionPositions: [],
    optionTransactions: [],
  };
}

/**
 * Upgrades a transaction possibly saved before `side` existed and before
 * `totalCost` was renamed to `totalValue` — without this, an early tester's
 * already-persisted localStorage would render "$NaN" / "Bought" on every
 * old row after this update ships.
 */
function normalizeTransaction(raw: Transaction & { totalCost?: number }): Transaction {
  return {
    ...raw,
    side: raw.side ?? "buy",
    totalValue: raw.totalValue ?? raw.totalCost ?? 0,
  };
}

/** True for a well-formed OptionPosition; used to filter out anything malformed rather than reject the whole store. */
function isValidOptionPosition(p: unknown): p is OptionPosition {
  const pos = p as Partial<OptionPosition> | null;
  return !!(
    pos &&
    typeof pos.id === "string" &&
    isKnownTicker(pos.underlying) &&
    ["call", "put"].includes(pos.side as string) &&
    Number.isFinite(pos.strike) &&
    typeof pos.expiration === "string" &&
    Number.isFinite(pos.contracts) &&
    (pos.contracts ?? 0) > 0 &&
    Number.isFinite(pos.costBasisPremium)
  );
}

function isValidOptionTransaction(t: unknown): t is OptionTransaction {
  const txn = t as Partial<OptionTransaction> | null;
  return !!(
    txn &&
    typeof txn.id === "string" &&
    isKnownTicker(txn.underlying) &&
    ["call", "put"].includes(txn.side as string) &&
    Number.isFinite(txn.strike) &&
    typeof txn.expiration === "string" &&
    Number.isFinite(txn.contracts) &&
    Number.isFinite(txn.premium) &&
    Number.isFinite(txn.timestamp)
  );
}

function readFromStorage(): PortfolioState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<PortfolioState>;
    if (
      typeof parsed.cashBalance !== "number" ||
      !Number.isFinite(parsed.cashBalance) ||
      parsed.cashBalance < 0 ||
      !Array.isArray(parsed.holdings) ||
      !Array.isArray(parsed.transactions)
    ) {
      return defaultState();
    }
    if (
      !parsed.holdings.every(
        (h) =>
          h &&
          isKnownTicker(h.ticker) &&
          Number.isFinite(h.shares) &&
          h.shares >= 0 &&
          (h.costBasis === undefined || (Number.isFinite(h.costBasis) && h.costBasis > 0)),
      ) ||
      !parsed.transactions.every(
        (t) =>
          t &&
          isKnownTicker(t.ticker) &&
          Number.isFinite(t.quantity) &&
          Number.isFinite(t.pricePerShare) &&
          Number.isFinite(t.timestamp),
      )
    )
      return defaultState();
    return {
      ...parsed,
      transactions: parsed.transactions.map(normalizeTransaction),
      // Missing on any localStorage saved before options existed — default
      // to empty rather than treating it as corrupt and wiping everything
      // else out. Anything malformed within the arrays is just dropped.
      optionPositions: Array.isArray(parsed.optionPositions)
        ? parsed.optionPositions.filter(isValidOptionPosition)
        : [],
      optionTransactions: Array.isArray(parsed.optionTransactions)
        ? parsed.optionTransactions.filter(isValidOptionTransaction)
        : [],
    } as PortfolioState;
  } catch {
    return defaultState();
  }
}

// Module-level store shared by every component reading the portfolio, so a
// trade made on the Buy screen is immediately visible on Portfolio/Activity.
//
// `null` specifically means "not hydrated from localStorage yet" — distinct
// from a loaded-but-empty portfolio. Consumers should treat `null` as a
// brief loading state, not as "no cash / no trades", otherwise a returning
// visitor with real balances would see a flash of the wrong numbers before
// their actual data replaces it a moment later.
let snapshot: PortfolioState | null = typeof window !== "undefined" ? readFromStorage() : null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot(): PortfolioState | null {
  // There's no localStorage on the server, so the real state genuinely
  // isn't known yet — returning `null` (rather than guessing at the mock
  // default) lets the UI render a neutral loading state instead of content
  // that might have to visibly change again right after hydration.
  return null;
}

function persist(next: PortfolioState) {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore write failures (private browsing, storage disabled, etc.)
  }
  listeners.forEach((listener) => listener());
}

/**
 * Applies a completed buy or sell to the local mock portfolio: moves cash,
 * adjusts shares, and logs a transaction.
 *
 * This is intentionally kept separate from `executeTrade()` in lib/trade.ts
 * — that function is the swap itself; this is the "refresh my balances
 * afterwards" step. Once a teammate wires executeTrade to a real Solana
 * swap, this is the seam that would instead re-sync from on-chain state.
 */
function recordTrade(params: {
  ticker: TickerSymbol;
  side: TradeSide;
  quantity: number;
  pricePerShare: number;
  totalValue: number;
  copiedFromInvestorId?: string;
  note?: string;
  wrongIf?: string;
  leg?: "gap" | "mark";
  via?: "ticket" | "plan" | "agent" | "copy";
  planId?: string;
}) {
  // By the time a trade can be confirmed the store has necessarily already
  // hydrated (the Buy/Sell screen needs real cash/holdings to render at
  // all), so this fallback only matters for a same-tick call before that
  // finishes.
  const current = snapshot ?? defaultState();
  const next = applyFill(current, params);

  const transaction: Transaction = {
    id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ticker: params.ticker,
    side: params.side,
    quantity: params.quantity,
    pricePerShare: params.pricePerShare,
    totalValue: params.totalValue,
    timestamp: Date.now(),
    copiedFromInvestorId: params.copiedFromInvestorId,
    note: params.note,
    wrongIf: params.wrongIf,
    leg: params.leg,
    via: params.via,
    planId: params.planId,
  };

  persist({
    ...current,
    ...next,
    transactions: [transaction, ...current.transactions],
  });
}

/** True when this browser has any practice history worth importing into an account. */
function localHasHistory(state: PortfolioState | null): boolean {
  return !!state && (state.holdings.length > 0 || state.transactions.length > 0 || Math.abs(state.cashBalance - MY_CASH_BALANCE) > 0.005);
}

/**
 * Applies a completed options buy: moves cash, adds/tops-up the position,
 * and logs an options transaction. Same split as `recordTrade` — this is
 * the "refresh my balances" step, kept separate from the fill itself (see
 * lib/options-trade.ts).
 */
function recordOptionsTrade(params: { contract: OptionContract; contracts: number }) {
  const current = snapshot ?? defaultState();
  const next = applyOptionsFill(current, params);

  const transaction: OptionTransaction = {
    id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    underlying: params.contract.underlying,
    side: params.contract.side,
    strike: params.contract.strike,
    expiration: params.contract.expiration,
    contracts: params.contracts,
    premium: params.contract.premium,
    totalValue: contractCost(params.contract.premium, params.contracts),
    timestamp: Date.now(),
  };

  persist({
    ...current,
    ...next,
    optionTransactions: [transaction, ...current.optionTransactions],
  });
}

function useLocalPortfolio() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const recordTradeCb = useCallback((params: Parameters<typeof recordTrade>[0]) => recordTrade(params), []);
  const recordOptionsTradeCb = useCallback(
    (params: Parameters<typeof recordOptionsTrade>[0]) => recordOptionsTrade(params),
    [],
  );

  // One-time nudge past the `null` SSR placeholder to the real value
  // already sitting in `snapshot` — useSyncExternalStore doesn't re-check
  // getSnapshot() on its own after mount, only when a listener fires, and
  // nothing does that for a returning visitor unless we ask here. See the
  // matching comment in use-followed-investors.ts.
  useEffect(() => {
    listeners.forEach((listener) => listener());
  }, []);

  return {
    ...(state ?? { cashBalance: 0, holdings: [], transactions: [], optionPositions: [], optionTransactions: [] }),
    /** False for the brief window before localStorage has been read on mount. */
    isLoaded: state !== null,
    recordTrade: recordTradeCb,
    recordOptionsTrade: recordOptionsTradeCb,
  };
}

// --- the server-side practice ledger for signed-in owners ------------------------

interface ServerState {
  owner: string;
  cashBalance: number;
  holdings: HoldingPosition[];
  transactions: Transaction[];
  version: number;
}

let serverState: ServerState | null = null;
let serverLoading: string | null = null;
const serverListeners = new Set<() => void>();

function serverNotify() {
  serverListeners.forEach((l) => l());
}

/** Replaces the server snapshot from a /api/practice or /api/practice/fill reply. */
export function applyServerPractice(owner: string, portfolio: PracticeRow, transactions?: Transaction[], prepend?: Transaction) {
  const existing = serverState?.owner === owner ? serverState.transactions : [];
  serverState = {
    owner,
    cashBalance: portfolio.cash,
    holdings: portfolio.holdings,
    transactions: transactions ?? (prepend ? [prepend, ...existing] : existing),
    version: portfolio.version,
  };
  serverNotify();
}

export function getServerPracticeVersion(): number | undefined {
  return serverState?.version;
}

async function loadServerPractice(owner: string, token: string) {
  if (serverLoading === owner) return;
  serverLoading = owner;
  try {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const res = await fetch("/api/practice", { headers });
    if (!res.ok) return;
    const data = (await res.json()) as { portfolio: PracticeRow | null; transactions: Transaction[] };
    if (data.portfolio) {
      applyServerPractice(owner, data.portfolio, data.transactions);
      return;
    }
    // First sign-in on this account: bring this device's practice history along, or start fresh.
    const local = snapshot;
    const body = localHasHistory(local)
      ? { cash: local!.cashBalance, holdings: local!.holdings, fills: local!.transactions }
      : null;
    const seeded = await fetch(body ? "/api/practice/import" : "/api/practice/reset", { method: "POST", headers, body: body ? JSON.stringify(body) : "{}" });
    if (!seeded.ok) return;
    const created = (await seeded.json()) as { portfolio: PracticeRow };
    applyServerPractice(owner, created.portfolio, body ? local!.transactions : []);
  } catch {
    // Offline or not migrated yet: the local store keeps serving.
  } finally {
    serverLoading = null;
  }
}

const SERVER_POLL_MS = 15_000;

function useServerPortfolio(owner: string | null, token: string | null) {
  const state = useSyncExternalStore(
    (l) => {
      serverListeners.add(l);
      return () => serverListeners.delete(l);
    },
    () => serverState,
    () => null,
  );
  useEffect(() => {
    if (!owner || !token) return;
    const load = () => loadServerPractice(owner, token);
    load();
    const interval = setInterval(load, SERVER_POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [owner, token]);
  return owner && state?.owner === owner ? state : null;
}

/**
 * The practice portfolio every screen reads: the account's server ledger
 * when signed in (fills priced and settled by the server), this browser's
 * local ledger otherwise. Same shape either way.
 */
export function usePortfolio() {
  const local = useLocalPortfolio();
  const { owner, token, signedIn } = useSession();
  const server = useServerPortfolio(signedIn ? owner : null, signedIn ? token : null);
  const serverRecord = useCallback((params: Parameters<typeof recordTrade>[0]) => {
    // Server fills are settled by /api/practice/fill; the reply already replaced the snapshot.
    void params;
  }, []);
  if (signedIn) {
    return {
      cashBalance: server?.cashBalance ?? 0,
      holdings: server?.holdings ?? [],
      transactions: server?.transactions ?? [],
      optionPositions: [] as OptionPosition[],
      optionTransactions: [] as OptionTransaction[],
      isLoaded: server !== null,
      recordTrade: serverRecord,
      recordOptionsTrade: local.recordOptionsTrade,
      source: "server" as const,
    };
  }
  return { ...local, source: "local" as const };
}
