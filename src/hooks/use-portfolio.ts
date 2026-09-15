"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { MY_CASH_BALANCE, MY_HOLDINGS, TICKERS } from "@/lib/mock-data";
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
    holdings: MY_HOLDINGS.map((h) => ({ ...h })),
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
    Object.hasOwn(TICKERS, pos.underlying as TickerSymbol) &&
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
    Object.hasOwn(TICKERS, txn.underlying as TickerSymbol) &&
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
          Object.hasOwn(TICKERS, h.ticker) &&
          Number.isFinite(h.shares) &&
          h.shares >= 0 &&
          (h.costBasis === undefined || (Number.isFinite(h.costBasis) && h.costBasis > 0)),
      ) ||
      !parsed.transactions.every(
        (t) =>
          t &&
          Object.hasOwn(TICKERS, t.ticker) &&
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
  };

  persist({
    ...current,
    ...next,
    transactions: [transaction, ...current.transactions],
  });
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

export function usePortfolio() {
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
