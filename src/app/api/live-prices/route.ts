import { NextResponse } from "next/server";

// Which of Stocklana's tickers get a real live price, and what symbol to
// ask Finnhub for. Only these two — see the design conversation this came
// out of for why the other 6 stay simulated (this was actually a second
// choice: Pyth was tried first, but real equity coverage there requires a
// $2,500+/month plan; Finnhub's free tier covers real US equities directly).
const SYMBOLS: Record<string, string> = {
  AAPLx: "AAPL",
  AMZNx: "AMZN",
};

interface FinnhubQuote {
  c: number; // current price
  t: number; // quote timestamp (unix seconds)
}

/**
 * Proxies real-time AAPL and AMZN quotes from Finnhub. Server-only, so
 * FINNHUB_API_KEY never reaches the browser. This is the one live,
 * real-world data source in an otherwise fully simulated app — see the
 * design conversation this came out of for why it's scoped to just these
 * two tickers rather than replacing the whole pricing model.
 */
export async function GET() {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FINNHUB_API_KEY is not configured" }, { status: 501 });
  }

  try {
    const results = await Promise.all(
      Object.entries(SYMBOLS).map(async ([ticker, symbol]) => {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`, {
          // Always hit Finnhub fresh — this endpoint exists specifically to be real-time.
          cache: "no-store",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as Partial<FinnhubQuote>;
        // Finnhub returns c: 0 (with no error) for an invalid/unrecognized
        // symbol, so treat that as "no data" rather than a real $0 price.
        if (typeof data.c !== "number" || data.c <= 0) return null;
        return [ticker, data.c] as const;
      }),
    );

    const prices: Record<string, number> = {};
    for (const entry of results) {
      if (entry) prices[entry[0]] = entry[1];
    }

    return NextResponse.json({ prices });
  } catch {
    return NextResponse.json({ error: "Failed to reach Finnhub" }, { status: 502 });
  }
}
