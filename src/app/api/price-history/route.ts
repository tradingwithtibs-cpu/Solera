import { NextResponse, type NextRequest } from "next/server";
import { findCatalogToken } from "@/lib/catalog-server";
import type { TickerSymbol } from "@/lib/types";

/**
 * Trailing 7-day price history for every ticker, from CoinGecko's free
 * public API (no key). Token-level prices in USD, so unlike a pool-level
 * OHLCV lookup it can't pick up the wrong side of a pair. This is what
 * draws every sparkline and the "trailing change" badge — one real series
 * for both, so the number and the picture always agree.
 *
 * Cached for 15 minutes: a 7-day series barely changes minute to minute,
 * and the public endpoint allows only a few dozen calls a minute. After the
 * first fill, a stale cache is served while the next refresh runs, so no
 * request ever waits on CoinGecko.
 */
const COINGECKO = "https://api.coingecko.com/api/v3/coins";
const CACHE_TTL_MS = 15 * 60_000;
/**
 * 30 days of hourly data, thinned to ~4 points a day. The last quarter of
 * the series is the 7-day window every sparkline draws.
 */
const DAYS = 30;
const MAX_POINTS = 120;

/** CoinGecko coin ids for each xStock, looked up from /coins/list on 2026-09-17. */
const COINGECKO_IDS: Record<TickerSymbol, string> = {
  AAPLx: "apple-xstock",
  TSLAx: "tesla-xstock",
  SPYx: "sp500-xstock",
  NVDAx: "nvidia-xstock",
  AMZNx: "amazon-xstock",
  GOOGLx: "alphabet-xstock",
  METAx: "meta-xstock",
  COINx: "coinbase-xstock",
};

export interface PriceHistoryResponse {
  source: "coingecko";
  /** Closes over the last 30 days, oldest → newest, in USD, ~4 per day. */
  history: Partial<Record<TickerSymbol, number[]>>;
  fetchedAt: number;
}

const TICKERS = Object.keys(COINGECKO_IDS) as TickerSymbol[];
let cached: { at: number; body: PriceHistoryResponse } | null = null;

let refreshing: Promise<PriceHistoryResponse | null> | null = null;

const single = new Map<string, { at: number; series: number[] }>();

export async function GET(request: NextRequest) {
  // One catalog ticker on demand (asset page), cached per ticker.
  const one = request.nextUrl.searchParams.get("ticker");
  if (one && !COINGECKO_IDS[one as TickerSymbol]) {
    const hit = single.get(one);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return NextResponse.json({ source: "coingecko", history: { [one]: hit.series }, fetchedAt: hit.at });
    const token = await findCatalogToken(one);
    if (!token?.coingeckoId) return NextResponse.json({ error: "Unknown ticker" }, { status: 404 });
    try {
      const series = await fetchSeriesById(token.coingeckoId);
      single.set(one, { at: Date.now(), series });
      return NextResponse.json({ source: "coingecko", history: { [one]: series }, fetchedAt: Date.now() });
    } catch {
      return NextResponse.json({ error: "Price history unavailable" }, { status: 502 });
    }
  }

  const fresh = cached && Date.now() - cached.at < CACHE_TTL_MS;
  if (fresh) return NextResponse.json(cached!.body);

  // One refresh at a time, shared by every concurrent request.
  refreshing ??= refresh().finally(() => {
    refreshing = null;
  });

  // Stale-while-revalidate: anyone who has ever seen data gets the last
  // good series immediately; only the very first request waits.
  if (cached) return NextResponse.json(cached.body);

  const body = await refreshing;
  if (!body) return NextResponse.json({ error: "Price history unavailable" }, { status: 502 });
  return NextResponse.json(body);
}

async function refresh(): Promise<PriceHistoryResponse | null> {
  const body: PriceHistoryResponse = { source: "coingecko", history: {}, fetchedAt: Date.now() };
  const results = await Promise.allSettled(TICKERS.map((t) => fetchSeries(t)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length >= 2) body.history[TICKERS[i]] = r.value;
  });
  if (Object.keys(body.history).length === 0) return null; // don't cache a total failure
  // Keep any ticker the previous refresh had that this one missed.
  body.history = { ...(cached?.body.history ?? {}), ...body.history };
  cached = { at: body.fetchedAt, body };
  // The parallel burst usually trips CoinGecko's per-minute limit for a few
  // tickers. Don't make the request wait: fill them in behind the scenes.
  void backfill();
  return body;
}

let backfilling = false;

/** Retries any ticker still missing, spaced out to stay under the rate limit, merging into the cache. */
async function backfill() {
  if (backfilling) return;
  backfilling = true;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const missing = TICKERS.filter((t) => !cached?.body.history[t]);
      if (missing.length === 0) return;
      for (const ticker of missing) {
        await new Promise((r) => setTimeout(r, 12_000));
        try {
          const series = await fetchSeries(ticker);
          if (series.length >= 2 && cached) {
            cached = { ...cached, body: { ...cached.body, history: { ...cached.body.history, [ticker]: series } } };
          }
        } catch {
          // Try again on the next pass.
        }
      }
    }
  } finally {
    backfilling = false;
  }
}

async function fetchSeries(ticker: TickerSymbol): Promise<number[]> {
  return fetchSeriesById(COINGECKO_IDS[ticker]);
}

async function fetchSeriesById(coingeckoId: string): Promise<number[]> {
  const res = await fetch(`${COINGECKO}/${coingeckoId}/market_chart?vs_currency=usd&days=${DAYS}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const data = (await res.json()) as { prices?: [number, number][] };
  const prices = (data.prices ?? []).map(([, price]) => price).filter((p) => Number.isFinite(p) && p > 0);
  return downsample(prices, MAX_POINTS);
}

/** Keeps the first and last points exactly, evenly spaced picks in between. */
function downsample(series: number[], max: number): number[] {
  if (series.length <= max) return series;
  const step = (series.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => series[Math.round(i * step)]);
}
