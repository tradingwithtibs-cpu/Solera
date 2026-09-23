import { COMPANIES, type CompanyId } from "./pre-ipo";
import { HttpError } from "./http-error";
import { dedupeNews, finnhubSymbolFor, newsQueryForCompany, parseGoogleNewsRss, type NewsItem } from "./news";
import type { TickerSymbol } from "./types";

/**
 * The news loaders behind /api/news, callable in-process: the route is a
 * thin wrapper and the agent's get_news tool calls loadNews() directly
 * (an HTTP hop to ourselves would be a second function invocation).
 * Cached per query for 10 minutes; Finnhub's free tier is 60 calls/minute
 * and Google News is unmetered but slow, so neither is hit per view.
 */
const FINNHUB = "https://finnhub.io/api/v1";
const GOOGLE_NEWS = "https://news.google.com/rss/search";
const CACHE_TTL_MS = 10 * 60_000;
const LIMIT = 12;

export const TICKER_QUERY = /^[A-Z0-9.]{1,12}x$/;

export interface NewsResponse {
  items: NewsItem[];
  source: "finnhub" | "google-news";
  fetchedAt: number;
}

export type NewsQuery = { ticker: string } | { company: string } | Record<string, never>;

const cache = new Map<string, { at: number; body: NewsResponse }>();

/** News for a ticker, a private company, or the market. Throws HttpError 404 for unknown keys and 502 when every source failed and nothing is cached. */
export async function loadNews(q: NewsQuery): Promise<NewsResponse> {
  let key: string;
  let load: () => Promise<NewsResponse>;
  if ("ticker" in q && q.ticker) {
    if (!TICKER_QUERY.test(q.ticker)) throw new HttpError(404, "Unknown ticker");
    const ticker = q.ticker as TickerSymbol;
    key = `ticker:${ticker}`;
    load = () => tickerNews(ticker);
  } else if ("company" in q && q.company) {
    if (!Object.hasOwn(COMPANIES, q.company)) throw new HttpError(404, "Unknown company");
    const company = q.company as CompanyId;
    key = `company:${company}`;
    load = () => googleNews(newsQueryForCompany(company));
  } else {
    key = "general";
    load = generalNews;
  }
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.body;
  try {
    const body = await load();
    cache.set(key, { at: body.fetchedAt, body });
    return body;
  } catch {
    // Serve stale on failure rather than nothing.
    if (hit) return hit.body;
    throw new HttpError(502, "News unavailable");
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

function stripSourceSuffix(headline: string, source: string): string {
  const trimmed = headline.replace(/\s+-\s+[\w.-]+\.(com|net|org|co\.uk)$/i, "");
  const bySource = new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  return trimmed.replace(bySource, "");
}

function fromFinnhub(articles: FinnhubArticle[]): NewsItem[] {
  return articles
    .filter((a) => a.headline && a.url && a.datetime)
    .map((a) => ({
      id: String(a.id),
      // Finnhub often appends " - reuters.com" or " - Reuters"; the source is shown separately anyway.
      headline: stripSourceSuffix(a.headline, a.source),
      source: a.source,
      url: a.url,
      publishedAt: a.datetime * 1000,
      // Finnhub substitutes the publisher's logo (a dark square) when a story has no picture; that is not a thumbnail.
      image: a.image && !/\/logo\//i.test(a.image) ? a.image : undefined,
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
