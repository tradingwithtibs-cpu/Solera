import { NextResponse, type NextRequest } from "next/server";
import { COMPANIES, type CompanyId } from "@/lib/pre-ipo";
import { XSTOCK_TOKENS } from "@/lib/tokens";
import { dedupeNews, finnhubSymbolFor, newsQueryForCompany, parseGoogleNewsRss, type NewsItem } from "@/lib/news";
import type { TickerSymbol } from "@/lib/types";

const FINNHUB = "https://finnhub.io/api/v1";
const GOOGLE_NEWS = "https://news.google.com/rss/search";
const CACHE_TTL_MS = 10 * 60_000;
const LIMIT = 12;

export interface NewsResponse {
  items: NewsItem[];
  source: "finnhub" | "google-news";
  fetchedAt: number;
}

const cache = new Map<string, { at: number; body: NewsResponse }>();

/**
 * GET /api/news                → general market news
 * GET /api/news?ticker=AAPLx   → the listed company behind an xStock
 * GET /api/news?company=openai → a private company (pre-IPO)
 *
 * Cached per query for 10 minutes; Finnhub's free tier is 60 calls/minute
 * and Google News is unmetered but slow, so neither should be hit per view.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ticker = params.get("ticker");
  const company = params.get("company");

  let key: string;
  let load: () => Promise<NewsResponse>;
  if (ticker) {
    if (!Object.hasOwn(XSTOCK_TOKENS, ticker)) return NextResponse.json({ error: "Unknown ticker" }, { status: 404 });
    key = `ticker:${ticker}`;
    load = () => tickerNews(ticker as TickerSymbol);
  } else if (company) {
    if (!Object.hasOwn(COMPANIES, company)) return NextResponse.json({ error: "Unknown company" }, { status: 404 });
    key = `company:${company}`;
    load = () => googleNews(newsQueryForCompany(company as CompanyId));
  } else {
    key = "general";
    load = generalNews;
  }

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return NextResponse.json(hit.body);
  try {
    const body = await load();
    cache.set(key, { at: body.fetchedAt, body });
    return NextResponse.json(body);
  } catch {
    // Serve stale on failure rather than nothing.
    if (hit) return NextResponse.json(hit.body);
    return NextResponse.json({ error: "News unavailable" }, { status: 502 });
  }
}

interface FinnhubArticle {
  id: number;
  headline: string;
  source: string;
  url: string;
  datetime: number;
  image?: string;
  summary?: string;
}

function fromFinnhub(articles: FinnhubArticle[]): NewsItem[] {
  return articles
    .filter((a) => a.headline && a.url && a.datetime)
    .map((a) => ({
      id: String(a.id),
      // Finnhub often appends " - reuters.com"; the source is shown separately anyway.
      headline: a.headline.replace(/\s+-\s+[\w.-]+\.(com|net|org|co\.uk)$/i, ""),
      source: a.source,
      url: a.url,
      publishedAt: a.datetime * 1000,
      image: a.image || undefined,
      summary: a.summary || undefined,
    }));
}

async function finnhub(path: string): Promise<FinnhubArticle[] | null> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return null;
  const res = await fetch(`${FINNHUB}${path}&token=${token}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  return (await res.json()) as FinnhubArticle[];
}

async function tickerNews(ticker: TickerSymbol): Promise<NewsResponse> {
  const symbol = finnhubSymbolFor(ticker);
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 86_400_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const articles = await finnhub(`/company-news?symbol=${symbol}&from=${day(from)}&to=${day(to)}`);
  if (articles) return { items: dedupeNews(fromFinnhub(articles), LIMIT), source: "finnhub", fetchedAt: Date.now() };
  return googleNews(`${symbol} stock when:7d`);
}

async function generalNews(): Promise<NewsResponse> {
  const articles = await finnhub(`/news?category=general`);
  if (articles) return { items: dedupeNews(fromFinnhub(articles), LIMIT), source: "finnhub", fetchedAt: Date.now() };
  return googleNews("stock market when:2d");
}

async function googleNews(query: string): Promise<NewsResponse> {
  const url = `${GOOGLE_NEWS}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Solera news reader)" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google News ${res.status}`);
  const items = parseGoogleNewsRss(await res.text());
  return { items: dedupeNews(items, LIMIT), source: "google-news", fetchedAt: Date.now() };
}
