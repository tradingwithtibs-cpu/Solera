/**
 * Jupiter Ultra — the swap engine behind every live trade. Ultra is a
 * three-step flow: ask for an order (Jupiter builds a complete, unsigned
 * transaction for the best route), have the user's wallet sign it, hand the
 * signed bytes back for Jupiter to land on-chain. No API key is needed on
 * the lite host, nothing runs server-side, and the only private key involved
 * is the user's, inside their own wallet.
 *
 * Docs: https://dev.jup.ag/docs/ultra-api
 */
const ULTRA_BASE = "https://lite-api.jup.ag/ultra/v1";

export interface UltraOrder {
  requestId: string;
  /** Base64 unsigned VersionedTransaction. Absent when no `taker` was given (quote only). */
  transaction?: string | null;
  inputMint: string;
  outputMint: string;
  /** Base units. */
  inAmount: string;
  outAmount: string;
  slippageBps: number;
  /** Jupiter's own fee in basis points, taken from the trade. */
  feeBps: number;
  priceImpactPct?: string;
  inUsdValue?: number;
  outUsdValue?: number;
  router?: string;
  errorCode?: number;
  errorMessage?: string;
}

export interface UltraExecuteResult {
  status: "Success" | "Failed";
  signature?: string;
  slot?: string;
  code?: number;
  error?: string;
  /** Actual base units moved, once landed. */
  inputAmountResult?: string;
  outputAmountResult?: string;
}

export interface UltraBalances {
  [mintOrSOL: string]: { amount: string; uiAmount: number; slot: number; isFrozen: boolean } | undefined;
}

export interface OrderParams {
  inputMint: string;
  outputMint: string;
  /** Base units of `inputMint`. */
  amount: string;
  /** The wallet that will sign. Omit for a price-only quote. */
  taker?: string;
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Jupiter returned an unexpected response (${res.status})`);
  }
}

/** A full order (with `taker`) or a quote (without). */
export async function getUltraOrder(params: OrderParams): Promise<UltraOrder> {
  const query = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
  });
  if (params.taker) query.set("taker", params.taker);

  const res = await fetch(`${ULTRA_BASE}/order?${query}`, { cache: "no-store" });
  const order = await readJson<UltraOrder>(res);
  if (!res.ok || order.errorMessage) {
    throw new Error(order.errorMessage ?? `Jupiter could not build this order (${res.status})`);
  }
  return order;
}

/**
 * Submits the signed transaction. Jupiter lands it and waits for
 * confirmation, so a `Success` here means the swap is final. The same
 * signed bytes can be resubmitted for up to two minutes without risk of a
 * double fill — the signature is identical — which is what `retries` uses
 * when Jupiter's first attempt times out.
 */
export async function executeUltraOrder(
  signedTransactionBase64: string,
  requestId: string,
  retries = 2,
): Promise<UltraExecuteResult> {
  let last: UltraExecuteResult | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${ULTRA_BASE}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedTransaction: signedTransactionBase64, requestId }),
    });
    last = await readJson<UltraExecuteResult>(res);
    if (last.status === "Success") return last;
    // Anything other than a transient "not yet confirmed" style failure is final.
    if (last.error && !/expired|timeout|timed out|not confirmed/i.test(last.error)) return last;
  }
  return last ?? { status: "Failed", error: "No response from Jupiter" };
}

/** Every token balance the wallet holds, keyed by mint ("SOL" for native SOL). Includes Token-2022. */
export async function getUltraBalances(walletAddress: string): Promise<UltraBalances> {
  const res = await fetch(`${ULTRA_BASE}/balances/${walletAddress}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not read wallet balances (${res.status})`);
  return readJson<UltraBalances>(res);
}

export function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}
