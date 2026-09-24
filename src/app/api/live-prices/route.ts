import { NextResponse, type NextRequest } from "next/server";
import { PYTH_FEEDS } from "@/lib/pyth-feeds";
import { loadLivePrices, priceExtraTickers } from "@/lib/live-prices-server";


/**
 * GET /api/live-prices            → every featured ticker: xStock price (Jupiter or Hermes),
 *                                   the underlying share's Pyth reference, SOL/USD, 24h moves.
 * GET /api/live-prices?tickers=…  → non-featured catalog tickers, priced through Jupiter on demand.
 *
 * A thin wrapper over lib/live-prices-server, which the agent's get_prices tool calls in-process.
 */
export async function GET(request: NextRequest) {
  const extra = (request.nextUrl.searchParams.get("tickers") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !PYTH_FEEDS[s])
    .slice(0, 20);
  if (extra.length > 0) {
    return NextResponse.json({ source: "pyth-onchain", prices: await priceExtraTickers(extra), underlying: {}, fetchedAt: Date.now() });
  }
  const body = await loadLivePrices();
  if (!body) return NextResponse.json({ error: "No live price source reachable" }, { status: 502 });
  return NextResponse.json(body);
}
