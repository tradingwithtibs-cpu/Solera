import type { OptionContract, OptionSide, TickerSymbol } from "./types";
import { isExpired, contractCost } from "./options";

export interface OptionsTradeParams {
  contract: OptionContract;
  contracts: number;
}

export interface OptionsTradeResult {
  success: true;
  underlying: TickerSymbol;
  side: OptionSide;
  strike: number;
  expiration: string;
  contracts: number;
  premium: number;
  totalValue: number;
  /** Fake transaction reference, standing in for a Solana signature. */
  txId: string;
  timestamp: number;
}

/**
 * Executes an options buy.
 *
 * ⚠️ MOCK IMPLEMENTATION, kept in its own file rather than folded into
 * trade.ts on purpose: real on-chain options don't share a protocol with
 * the stock-swap seam in trade.ts (that one's headed toward Jupiter; an
 * options fill would realistically go through something like Zeta,
 * PsyOptions, or Drift instead — a different SDK, different account/margin
 * model entirely). Whoever wires that up only needs to replace the body of
 * this function; nothing outside it should need to change.
 */
export async function executeOptionsTrade({ contract, contracts }: OptionsTradeParams): Promise<OptionsTradeResult> {
  if (
    !["call", "put"].includes(contract.side) ||
    !Number.isInteger(contracts) ||
    contracts <= 0 ||
    !Number.isFinite(contract.premium) ||
    contract.premium <= 0
  ) {
    throw new Error("Enter a valid order amount.");
  }
  if (isExpired(contract.expiration)) {
    throw new Error("This contract has expired. Please choose another.");
  }
  // Simulated network/confirmation latency.
  await new Promise((resolve) => setTimeout(resolve, 1400));

  return {
    success: true,
    underlying: contract.underlying,
    side: contract.side,
    strike: contract.strike,
    expiration: contract.expiration,
    contracts,
    premium: contract.premium,
    totalValue: contractCost(contract.premium, contracts),
    txId: `MOCK${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    timestamp: Date.now(),
  };
}
