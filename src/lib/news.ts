import { COMPANIES, type CompanyId } from "./pre-ipo";
import type { TickerSymbol } from "./types";

/**
 * News for what the user is looking at. Two sources, one shape:
 * - Finnhub for listed companies and general market news (needs the free
 *   FINNHUB_API_KEY; falls back to Google News without it).
 * - Google News RSS for private companies, which no market-data API covers.
 */
export interface NewsItem {
  id: string;
  headline: string;
  source: string;
  url: string;
  /** Unix milliseconds. */
  publishedAt: number;
  image?: string;
  summary?: string;
}

/** The listed ticker behind an xStock, for Finnhub: AAPLx → AAPL. */
export function finnhubSymbolFor(ticker: TickerSymbol): string {
  return ticker.replace(/x$/, "");
}

/** A Google News query that finds coverage of a private company and not, say, kalshi.com's own listings. */
export function newsQueryForCompany(company: CompanyId): string {
  const name = COMPANIES[company].name;
  return `"${name}" when:14d`;
}

/** Collapse near-duplicate headlines (syndicated copies), keep the newest, cap the list. */
export function dedupeNews(items: NewsItem[], limit: number): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of [...items].sort((a, b) => b.publishedAt - a.publishedAt)) {
    const key = item.headline
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .split(/\s+/)
      .slice(0, 8)
      .join(" ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

export function decodeEntities(text: string): string {
  return text.replace(/&(#?\w+);/g, (m, code: string) => {
    if (code in ENTITIES) return ENTITIES[code];
    if (code.startsWith("#x")) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return m;
  });
}

/** Minimal RSS 2.0 item parser for Google News — no XML dependency needed for this shape. */
export function parseGoogleNewsRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = match[1];
    const field = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}(?:[^>]*)>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
      return m ? decodeEntities(m[1].trim()) : "";
    };
    const rawTitle = field("title");
    const source = field("source");
    // Google appends " - Source" to titles; strip it when it matches the source tag.
    const headline = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
    const url = field("link");
    const published = Date.parse(field("pubDate"));
    if (!headline || !url || !Number.isFinite(published)) continue;
    items.push({ id: field("guid") || url, headline, source: source || "Google News", url, publishedAt: published });
  }
  return items;
}
