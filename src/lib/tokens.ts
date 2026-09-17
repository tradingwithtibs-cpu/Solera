import type { TickerSymbol } from "./types";

/**
 * The real Solana mainnet tokens behind every ticker in the app. All eight
 * xStocks are Token-2022 mints issued by Backed Finance with 8 decimals
 * (verified on-chain 2026-09-17). USDC is the settlement currency for live
 * trades: every buy spends USDC, every sell receives it.
 */
export interface TokenInfo {
  mint: string;
  decimals: number;
}

export const USDC: TokenInfo = { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 };
/** Native SOL, addressed by its wrapped mint — Jupiter unwraps/wraps automatically. */
export const SOL: TokenInfo = { mint: "So11111111111111111111111111111111111111112", decimals: 9 };

/**
 * What a live trade is paid in (buy) or paid out in (sell). SOL is the
 * default: it's what every Solana wallet already holds. USDC is there for
 * anyone who wants to size a position in exact dollars.
 */
export type SettlementCurrency = "SOL" | "USDC";
export const SETTLEMENT: Record<SettlementCurrency, TokenInfo> = { SOL, USDC };

/** SOL kept back on a max-size buy so the wallet can still pay network fees afterwards. */
export const SOL_FEE_RESERVE = 0.01;

export const XSTOCK_TOKENS: Record<TickerSymbol, TokenInfo> = {
  AAPLx: { mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", decimals: 8 },
  TSLAx: { mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", decimals: 8 },
  SPYx: { mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", decimals: 8 },
  NVDAx: { mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", decimals: 8 },
  AMZNx: { mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", decimals: 8 },
  GOOGLx: { mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", decimals: 8 },
  METAx: { mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", decimals: 8 },
  COINx: { mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", decimals: 8 },
};

const MINT_TO_TICKER = new Map<string, TickerSymbol>(
  (Object.entries(XSTOCK_TOKENS) as [TickerSymbol, TokenInfo][]).map(([t, info]) => [info.mint, t]),
);

export function tickerForMint(mint: string): TickerSymbol | undefined {
  return MINT_TO_TICKER.get(mint);
}

/** 1.5 USDC → "1500000". Truncates (never rounds up) so we can't spend more than the user has. */
export function toBaseUnits(uiAmount: number, decimals: number): string {
  if (!Number.isFinite(uiAmount) || uiAmount < 0) throw new Error("Invalid amount");
  // Go through a string to avoid float drift like 0.1 * 10**8 = 10000000.000000002,
  // with a few guard digits so we can cut (not round) at `decimals`.
  const [whole, frac = ""] = uiAmount.toFixed(decimals + 3).split(".");
  return BigInt(whole + frac.slice(0, decimals).padEnd(decimals, "0")).toString();
}

/** "1500000" → 1.5 for 6 decimals. */
export function fromBaseUnits(baseUnits: string | number | bigint, decimals: number): number {
  return Number(BigInt(baseUnits)) / 10 ** decimals;
}
