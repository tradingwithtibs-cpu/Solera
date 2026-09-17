import { PublicKey } from "@solana/web3.js";

/**
 * Reading Pyth straight off Solana, with no API key.
 *
 * Pyth's push oracle keeps `PriceUpdateV2` accounts on mainnet for feeds that
 * someone sponsors. Each lives at a PDA of the push-oracle program derived
 * from (shard id, feed id). Any RPC can read them, which makes this the one
 * Pyth path that costs nothing: Hermes and Pyth Pro both gate US-equity and
 * xStock feeds behind paid plans (see app/api/live-prices/route.ts for how
 * the two sources are combined).
 *
 * Layout (Anchor account, see pyth-solana-receiver `PriceUpdateV2`):
 *   8   discriminator
 *   32  write_authority
 *   1   verification_level tag (0 = Partial, followed by 1 byte num_signatures; 1 = Full)
 *   --- PriceFeedMessage ---
 *   32  feed_id
 *   8   price (i64)
 *   8   conf (u64)
 *   4   exponent (i32)
 *   8   publish_time (i64, unix seconds)
 *   8   prev_publish_time
 *   8   ema_price
 *   8   ema_conf
 *   --- 
 *   8   posted_slot
 */
export const PYTH_PUSH_ORACLE_PROGRAM_ID = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");

const DISCRIMINATOR = Buffer.from("22f123639d7ef4cd", "hex");

export interface OnChainPrice {
  feedId: string;
  price: number;
  conf: number;
  /** Unix seconds. */
  publishTime: number;
}

/** The account that holds `feedId`'s latest price on the given shard. */
export function derivePriceUpdateAddress(feedId: string, shard: number): PublicKey {
  const shardBuf = Buffer.alloc(2);
  shardBuf.writeUInt16LE(shard);
  return PublicKey.findProgramAddressSync([shardBuf, Buffer.from(feedId, "hex")], PYTH_PUSH_ORACLE_PROGRAM_ID)[0];
}

/**
 * Decodes a `PriceUpdateV2` account. Returns null for anything that isn't
 * one (wrong discriminator, truncated), so a bad or missing account can
 * never turn into a fake price.
 */
export function parsePriceUpdateV2(data: Uint8Array): OnChainPrice | null {
  const d = Buffer.from(data);
  if (d.length < 41 || !d.subarray(0, 8).equals(DISCRIMINATOR)) return null;
  const verificationTag = d[40];
  const start = verificationTag === 0 ? 42 : 41;
  if (d.length < start + 32 + 8 + 8 + 4 + 8) return null;
  const feedId = d.subarray(start, start + 32).toString("hex");
  const mantissa = d.readBigInt64LE(start + 32);
  const conf = d.readBigUInt64LE(start + 40);
  const expo = d.readInt32LE(start + 48);
  const publishTime = Number(d.readBigInt64LE(start + 52));
  const scale = 10 ** expo;
  return { feedId, price: Number(mantissa) * scale, conf: Number(conf) * scale, publishTime };
}
