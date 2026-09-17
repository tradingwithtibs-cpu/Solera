import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { PYTH_FEEDS, hermesPriceToNumber, isUnderlyingStale, type HermesPrice } from "@/lib/pyth-feeds";
import { derivePriceUpdateAddress, parsePriceUpdateV2 } from "@/lib/pyth-onchain";
import { SOL, XSTOCK_TOKENS } from "@/lib/tokens";
import type { TickerSymbol } from "@/lib/types";

const HERMES_URL = "https://pyth.dourolabs.app/hermes/v2/updates/price/latest";
const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v3";
const SOLANA_RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

/**
 * How long one upstream fetch is reused for every browser polling this
 * route. Every client hits this same server, so without this a handful of
 * open tabs would get the deployment rate-limited by Hermes (10 req / 10 s
 * on the free host), Jupiter, or the public Solana RPC. 5s still means the
 * UI is never more than a few seconds behind feeds that update sub-second.
 */
const CACHE_TTL_MS = 5_000;

export interface UnderlyingQuote {
  price: number;
  /** Unix seconds of the last equity print. */
  publishTime: number;
  /** True outside the regular US session (or during a feed outage). */
  stale: boolean;
}

export interface LivePricesResponse {
  /**
   * `pyth-hermes`: everything from Pyth's Hermes API (needs a key entitled
   * to equity + xStock feeds — e.g. the Pyth Pro plan).
   * `pyth-onchain`: underlying equities read from Pyth's PriceUpdateV2
   * accounts on Solana mainnet, xStock prices from Jupiter. No key needed.
   */
  source: "pyth-hermes" | "pyth-onchain";
  /** xStock token prices, 24/7 — the tradeable price. */
  prices: Partial<Record<TickerSymbol, number>>;
  /** Underlying listed-share prices from Pyth, regular session only. */
  underlying: Partial<Record<TickerSymbol, UnderlyingQuote>>;
  /** SOL/USD, for sizing SOL-paid trades and valuing SOL balances. */
  solUsd?: number;
  fetchedAt: number;
}

let cached: { at: number; body: LivePricesResponse } | null = null;

const TICKERS = Object.keys(PYTH_FEEDS) as TickerSymbol[];

/**
 * Live xStock and underlying-equity prices for every ticker in the app,
 * with Pyth as the reference price for the underlying share. Server-only,
 * so keys never reach the browser. This is the one real-world data source
 * behind every price the app shows: the trade seam, portfolio valuation,
 * options chain, and the premium/discount badge all read from it.
 *
 * Source order: Hermes when a key is configured and entitled (that's what
 * the Pyth Pro plan unlocks), otherwise Pyth's on-chain push accounts plus
 * Jupiter — which is free and needs nothing configured at all.
 */
export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }

  const body = (await fetchFromHermes()) ?? (await fetchOnChain());
  if (!body) {
    return NextResponse.json({ error: "No live price source reachable" }, { status: 502 });
  }
  cached = { at: body.fetchedAt, body };
  return NextResponse.json(body);
}

interface HermesResponse {
  parsed?: { id: string; price: HermesPrice }[];
}

/** Returns null when there's no key, the key isn't entitled to these feeds, or Hermes is down. */
async function fetchFromHermes(): Promise<LivePricesResponse | null> {
  const apiKey = process.env.PYTH_API_KEY;
  if (!apiKey) return null;

  const idToTicker = new Map<string, { ticker: TickerSymbol; kind: "xstock" | "equity" }>();
  for (const ticker of TICKERS) {
    idToTicker.set(PYTH_FEEDS[ticker].xstock, { ticker, kind: "xstock" });
    idToTicker.set(PYTH_FEEDS[ticker].equity, { ticker, kind: "equity" });
  }
  const params = new URLSearchParams({ parsed: "true", encoding: "hex" });
  for (const id of idToTicker.keys()) params.append("ids[]", id);

  try {
    const res = await fetch(`${HERMES_URL}?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as HermesResponse;

    const body: LivePricesResponse = { source: "pyth-hermes", prices: {}, underlying: {}, fetchedAt: Date.now() };
    for (const entry of data.parsed ?? []) {
      const match = idToTicker.get(entry.id.replace(/^0x/, ""));
      if (!match) continue;
      const price = hermesPriceToNumber(entry.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      if (match.kind === "xstock") {
        body.prices[match.ticker] = price;
      } else {
        body.underlying[match.ticker] = {
          price,
          publishTime: entry.price.publish_time,
          stale: isUnderlyingStale(entry.price.publish_time),
        };
      }
    }
    // A key that's only entitled to a base crypto set returns nothing useful; fall through.
    return Object.keys(body.prices).length > 0 ? body : null;
  } catch {
    return null;
  }
}

interface JupiterPriceResponse {
  [mint: string]: { usdPrice?: number } | undefined;
}

/** Pyth PriceUpdateV2 accounts on mainnet for the equities, Jupiter for the xStock tokens. */
async function fetchOnChain(): Promise<LivePricesResponse | null> {
  const body: LivePricesResponse = { source: "pyth-onchain", prices: {}, underlying: {}, fetchedAt: Date.now() };

  const [pyth, jupiter] = await Promise.allSettled([readPythAccounts(), readJupiterPrices()]);
  if (pyth.status === "fulfilled") body.underlying = pyth.value;
  if (jupiter.status === "fulfilled") {
    body.prices = jupiter.value.prices;
    body.solUsd = jupiter.value.solUsd;
  }

  return Object.keys(body.prices).length > 0 || Object.keys(body.underlying).length > 0 ? body : null;
}

async function readPythAccounts(): Promise<LivePricesResponse["underlying"]> {
  const tickers = TICKERS.filter((t) => PYTH_FEEDS[t].equityShard !== null);
  const addresses = tickers.map((t) => derivePriceUpdateAddress(PYTH_FEEDS[t].equity, PYTH_FEEDS[t].equityShard!));

  const connection = new Connection(SOLANA_RPC, "confirmed");
  const accounts = await connection.getMultipleAccountsInfo(addresses);

  const underlying: LivePricesResponse["underlying"] = {};
  accounts.forEach((account, i) => {
    if (!account) return;
    const parsed = parsePriceUpdateV2(account.data);
    const ticker = tickers[i];
    // Guard against a PDA collision or a repurposed account: the feed id
    // inside the account must be the one we asked for.
    if (!parsed || parsed.feedId !== PYTH_FEEDS[ticker].equity || parsed.price <= 0) return;
    underlying[ticker] = {
      price: parsed.price,
      publishTime: parsed.publishTime,
      stale: isUnderlyingStale(parsed.publishTime),
    };
  });
  return underlying;
}

async function readJupiterPrices(): Promise<{ prices: LivePricesResponse["prices"]; solUsd?: number }> {
  const mints = [...TICKERS.map((t) => XSTOCK_TOKENS[t].mint), SOL.mint];
  const res = await fetch(`${JUPITER_PRICE_URL}?ids=${mints.join(",")}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Jupiter responded ${res.status}`);
  const data = (await res.json()) as JupiterPriceResponse;

  const valid = (p: number | undefined): p is number => typeof p === "number" && Number.isFinite(p) && p > 0;
  const prices: LivePricesResponse["prices"] = {};
  for (const ticker of TICKERS) {
    const price = data[XSTOCK_TOKENS[ticker].mint]?.usdPrice;
    if (valid(price)) prices[ticker] = price;
  }
  const solUsd = data[SOL.mint]?.usdPrice;
  return { prices, solUsd: valid(solUsd) ? solUsd : undefined };
}
