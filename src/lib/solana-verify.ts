import { Connection } from "@solana/web3.js";

const SOLANA_RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

/**
 * Whether a landed transaction was paid for by `wallet`: true, false, or
 * null when the RPC cannot see it yet. Used for live fills and for the
 * deposit that arms a Jupiter Trigger plan.
 */
export async function verifyFeePayer(signature: string, wallet: string): Promise<boolean | null> {
  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) return null;
    if (tx.meta?.err) return false;
    const payer = tx.transaction.message.staticAccountKeys[0]?.toBase58();
    return payer === wallet;
  } catch {
    return null;
  }
}
