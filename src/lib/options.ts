import { getEffectivePrice } from "./live-prices";
import type { OptionContract, OptionSide, TickerSymbol } from "./types";

const MS_PER_DAY = 86_400_000;

/** Rounds a strike to a "nice" increment, scaled to the underlying's price. */
function strikeStep(price: number): number {
  if (price < 50) return 2.5;
  if (price < 200) return 5;
  if (price < 500) return 10;
  return 25;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Both expirations offered on every chain, in days from today. */
const EXPIRATION_OFFSETS_DAYS = [7, 30] as const;

/**
 * Simulated premium: intrinsic value (what you'd get if exercised today)
 * plus a rough, clearly-fake time-value component that shrinks the further
 * a strike sits from the current price and grows with days to expiration.
 * This is NOT an options pricing model — no volatility surface, no
 * Black-Scholes — it's just enough for a chain to look directionally sane
 * in a demo: closer to the money and further from expiration costs more.
 */
function simulatedPremium(side: OptionSide, spot: number, strike: number, daysOut: number): number {
  const intrinsic = side === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const distance = Math.abs(strike - spot) / spot;
  const timeValue = spot * 0.025 * Math.sqrt(daysOut / 30) * Math.max(0.1, 1 - distance * 4);
  return Math.max(0.05, Math.round((intrinsic + timeValue) * 100) / 100);
}

/**
 * Builds a small options chain for a ticker: five strikes around the
 * current price × two expirations × calls and puts. Nothing here is
 * persisted or has a stable identity beyond "today" — a contract only
 * becomes durable once it's bought, at which point its details are copied
 * into an OptionPosition (see use-portfolio.ts). Regenerating the chain
 * later (e.g. from a URL) reproduces the same contracts as long as it's
 * still the same day, since it's derived only from the ticker's current
 * mock price and the current date.
 */
export function generateOptionsChain(ticker: TickerSymbol): OptionContract[] {
  const spot = getEffectivePrice(ticker);
  const step = strikeStep(spot);
  const atm = roundToStep(spot, step);
  const strikes = [atm - 2 * step, atm - step, atm, atm + step, atm + 2 * step].filter((s) => s > 0);
  const now = Date.now();

  const contracts: OptionContract[] = [];
  for (const daysOut of EXPIRATION_OFFSETS_DAYS) {
    const expiration = new Date(now + daysOut * MS_PER_DAY).toISOString().slice(0, 10);
    for (const strike of strikes) {
      for (const side of ["call", "put"] as const) {
        contracts.push({
          underlying: ticker,
          side,
          strike,
          expiration,
          premium: simulatedPremium(side, spot, strike, daysOut),
        });
      }
    }
  }
  return contracts;
}

/** Identifies one contract spec within a single ticker's chain (used in URLs). */
export function optionContractId(contract: Pick<OptionContract, "side" | "strike" | "expiration">): string {
  return `${contract.side}-${contract.strike}-${contract.expiration}`;
}

/** Identifies one contract spec across tickers (used as an OptionPosition's id). */
export function optionPositionId(
  contract: Pick<OptionContract, "underlying" | "side" | "strike" | "expiration">,
): string {
  return `${contract.underlying}-${contract.side}-${contract.strike}-${contract.expiration}`;
}

/** Finds one contract by its id (see `optionContractId`) within a freshly generated chain. */
export function findOptionContract(ticker: TickerSymbol, id: string): OptionContract | undefined {
  return generateOptionsChain(ticker).find((c) => optionContractId(c) === id);
}

export function daysToExpiration(expiration: string): number {
  return Math.ceil((new Date(`${expiration}T23:59:59`).getTime() - Date.now()) / MS_PER_DAY);
}

export function isExpired(expiration: string): boolean {
  return daysToExpiration(expiration) < 0;
}

/** e.g. "Fri, Nov 21" */
export function formatExpiration(expiration: string): string {
  return new Date(`${expiration}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Dollar cost of a buy: premium is quoted per share, one contract covers 100. */
export function contractCost(premium: number, contracts: number): number {
  return premium * 100 * contracts;
}
