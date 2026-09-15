import type { HoldingPosition, OptionContract, OptionPosition, TickerSymbol, TradeSide } from "./types";
import { TICKERS } from "./mock-data";
import { contractCost, isExpired, optionPositionId } from "./options";
export const DUST_SHARES = 1e-6;
export interface PortfolioBalances {
  cashBalance: number;
  holdings: HoldingPosition[];
}
export interface Fill {
  ticker: TickerSymbol;
  side: TradeSide;
  quantity: number;
  pricePerShare: number;
  totalValue: number;
}

/** Validate again at settlement; UI validation can become stale while a trade is pending. */
export function applyFill(current: PortfolioBalances, params: Fill): PortfolioBalances {
  if (
    !Object.hasOwn(TICKERS, params.ticker) ||
    !["buy", "sell"].includes(params.side) ||
    ![params.quantity, params.pricePerShare, params.totalValue].every((n) => Number.isFinite(n) && n > 0) ||
    Math.abs(params.quantity * params.pricePerShare - params.totalValue) > 1e-7
  ) {
    throw new Error("This order is invalid. Please enter a new amount.");
  }
  if (params.side === "buy" && params.totalValue > current.cashBalance + 1e-8)
    throw new Error("Your available cash changed. Please review the amount.");
  if (
    params.side === "sell" &&
    params.quantity > (current.holdings.find((h) => h.ticker === params.ticker)?.shares ?? 0) + 1e-10
  )
    throw new Error("Your position changed. Please review the amount.");
  const existing = current.holdings.find((h) => h.ticker === params.ticker);

  let holdings: HoldingPosition[];
  if (params.side === "buy") {
    holdings = existing
      ? current.holdings.map((h) => {
          if (h.ticker !== params.ticker) return h;
          // Weighted-average the cost basis in with the new lot, so a
          // holding's unrealized gain/loss stays accurate across top-ups.
          const priorCost = h.costBasis ?? params.pricePerShare;
          const totalShares = h.shares + params.quantity;
          const costBasis = (h.shares * priorCost + params.quantity * params.pricePerShare) / totalShares;
          return { ...h, shares: totalShares, costBasis };
        })
      : [
          ...current.holdings,
          { ticker: params.ticker, shares: params.quantity, costBasis: params.pricePerShare },
        ];
  } else {
    // Selling doesn't change the remaining shares' cost basis (average-cost
    // method) — it just reduces the share count, and drops the position
    // entirely once it's down to dust.
    holdings = current.holdings
      .map((h) => (h.ticker === params.ticker ? { ...h, shares: h.shares - params.quantity } : h))
      .filter((h) => h.shares > DUST_SHARES);
  }

  return {
    holdings,
    cashBalance: Math.max(
      0,
      current.cashBalance + (params.side === "buy" ? -params.totalValue : params.totalValue),
    ),
  };
}

export interface OptionsPortfolioBalances {
  cashBalance: number;
  optionPositions: OptionPosition[];
}

export interface OptionsFill {
  contract: OptionContract;
  contracts: number;
}

/**
 * Buy-only settlement for options (see the design conversation this came
 * out of — no writing/selling, so there's no assignment risk to model).
 * Re-validates at settlement time, same defense-in-depth spirit as
 * `applyFill`: UI-time validation can go stale while a trade is pending.
 */
export function applyOptionsFill(
  current: OptionsPortfolioBalances,
  { contract, contracts }: OptionsFill,
): OptionsPortfolioBalances {
  if (
    !Object.hasOwn(TICKERS, contract.underlying) ||
    !["call", "put"].includes(contract.side) ||
    ![contract.strike, contract.premium].every((n) => Number.isFinite(n) && n > 0) ||
    !Number.isInteger(contracts) ||
    contracts <= 0
  ) {
    throw new Error("This order is invalid. Please enter a new amount.");
  }
  if (isExpired(contract.expiration)) {
    throw new Error("This contract has expired. Please choose another.");
  }
  const totalValue = contractCost(contract.premium, contracts);
  if (totalValue > current.cashBalance + 1e-8) {
    throw new Error("Your available cash changed. Please review the amount.");
  }

  const id = optionPositionId(contract);
  const existing = current.optionPositions.find((p) => p.id === id);
  const optionPositions = existing
    ? current.optionPositions.map((p) => {
        if (p.id !== id) return p;
        // Weighted-average the premium paid in with the new lot, same
        // convention as equity cost basis in `applyFill`.
        const totalContracts = p.contracts + contracts;
        const costBasisPremium =
          (p.contracts * p.costBasisPremium + contracts * contract.premium) / totalContracts;
        return { ...p, contracts: totalContracts, costBasisPremium };
      })
    : [...current.optionPositions, { ...contract, id, contracts, costBasisPremium: contract.premium }];

  return {
    optionPositions,
    cashBalance: Math.max(0, current.cashBalance - totalValue),
  };
}
