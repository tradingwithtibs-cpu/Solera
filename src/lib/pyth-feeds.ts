

/**
 * Pyth price feed IDs (Hermes) for every ticker in the app. Two feeds per
 * ticker:
 *
 * - `xstock`: the on-chain xStock token itself (e.g. Crypto.AAPLX/USD).
 *   Trades 24/7, so this is the price you can actually buy/sell at on
 *   Solana right now — it's what `getEffectivePrice` returns.
 * - `equity`: the underlying US-listed share (e.g. Equity.US.AAPL/USD).
 *   Only publishes during the NYSE/Nasdaq regular session; outside it the
 *   last print is still returned but with an old publish time (see
 *   `isUnderlyingStale`). Comparing the two is the whole point: an xStock
 *   trading above its underlying is at a premium, below is a discount.
 *
 * IDs are public (they're just feed identifiers), looked up from
 * https://hermes.pyth.network/v2/price_feeds. The API key lives only in the
 * server route that fetches prices, never here.
 */
export interface PythFeedPair {
  /** Hermes feed ID for the xStock token, hex without 0x. */
  xstock: string;
  /** Hermes feed ID for the underlying listed equity. */
  equity: string;
  /** Plain listed ticker, for labels like "vs AAPL". */
  equitySymbol: string;
  /**
   * Which Pyth push-oracle shard on Solana mainnet carries a live
   * PriceUpdateV2 account for the equity feed — see lib/pyth-onchain.ts.
   * Verified on 2026-09-17: shard 1 was being refreshed every few seconds
   * for these tickers, shard 0 was weeks stale. `null` means nobody is
   * currently pushing this equity on-chain, so it has no underlying price
   * unless Hermes is available.
   */
  equityShard: number | null;
}

/** Pyth feeds exist only for the featured tickers; catalog tokens have no premium badge. */
export const PYTH_FEEDS: Record<string, PythFeedPair> = {
  AAPLx: {
    xstock: "978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675",
    equity: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
    equitySymbol: "AAPL",
    equityShard: 1,
  },
  TSLAx: {
    xstock: "47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362",
    equity: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
    equitySymbol: "TSLA",
    equityShard: 1,
  },
  SPYx: {
    xstock: "2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14",
    equity: "19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5",
    equitySymbol: "SPY",
    equityShard: 1,
  },
  NVDAx: {
    xstock: "4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f",
    equity: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
    equitySymbol: "NVDA",
    equityShard: 1,
  },
  AMZNx: {
    xstock: "7148fbe6e493ff2580305c92a8d7f8628c9943b11b9b253aebc24863fec290e8",
    equity: "b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a",
    equitySymbol: "AMZN",
    equityShard: 1,
  },
  GOOGLx: {
    xstock: "b911b0329028cd0283e4259c33809d62942bd2716a58084e5f31d64c00b5424e",
    equity: "5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6",
    equitySymbol: "GOOGL",
    equityShard: 1,
  },
  METAx: {
    xstock: "bf3e5871be3f80ab7a4d1f1fd039145179fb58569e159aee1ccd472868ea5900",
    equity: "78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe",
    equitySymbol: "META",
    equityShard: 1,
  },
  COINx: {
    xstock: "641435d5dffb5311140b480517c79986d8488d5cf08a11eec53b83ad02cab33f",
    equity: "fee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245",
    equitySymbol: "COIN",
    equityShard: null,
  },
};

/**
 * An equity print older than this is treated as "market closed": the feed
 * publishes continuously during the regular session, so a gap this long
 * only happens outside it (or during an outage, which we treat the same).
 */
export const UNDERLYING_STALE_AFTER_MS = 15 * 60_000;

/** A Hermes `parsed[].price` object: integer mantissa as a string plus a base-10 exponent. */
export interface HermesPrice {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
}

/** Converts Hermes' `{ price: "23118000000", expo: -8 }` into a plain 231.18. */
export function hermesPriceToNumber(p: Pick<HermesPrice, "price" | "expo">): number {
  const mantissa = Number(p.price);
  if (!Number.isFinite(mantissa)) return NaN;
  return mantissa * 10 ** p.expo;
}

/** Whether an underlying-equity print is too old to compare against (market closed). */
export function isUnderlyingStale(publishTimeSec: number, nowMs = Date.now()): boolean {
  return nowMs - publishTimeSec * 1000 > UNDERLYING_STALE_AFTER_MS;
}

/**
 * Percent the xStock trades above (+) or below (−) its underlying share.
 * Returns undefined when either side is missing or non-positive, so callers
 * render nothing rather than a nonsense figure.
 */
export function premiumPct(xstockPrice: number | undefined, underlyingPrice: number | undefined): number | undefined {
  if (!xstockPrice || !underlyingPrice || xstockPrice <= 0 || underlyingPrice <= 0) return undefined;
  if (!Number.isFinite(xstockPrice) || !Number.isFinite(underlyingPrice)) return undefined;
  return ((xstockPrice - underlyingPrice) / underlyingPrice) * 100;
}
