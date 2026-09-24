import { NextResponse, type NextRequest } from "next/server";
import { HttpError } from "@/lib/http-error";
import { extractArticleImage } from "@/lib/news";
import { loadNews } from "@/lib/news-server";

/**
 * GET /api/news/thumb?id=…[&ticker=…|&company=…] → { image: string | null }
 *
 * A story's real picture when the feed gave none (Yahoo's items arrive
 * with the publisher's banner, which the feed drops): the article page's
 * og:image / twitter:image, read once and remembered for a day, misses
 * included. Only stories the app itself served can be asked about: the id
 * is looked up in that scope's feed, so this never fetches an arbitrary URL.
 */
const CACHE_TTL_MS = 24 * 3_600_000;
const MAX_BYTES = 200_000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export const maxDuration = 15;

const cache = new Map<string, { at: number; image: string | null }>();
const inflight = new Map<string, Promise<string | null>>();

async function articleImage(url: string): Promise<string | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.image;
  const pending = inflight.get(url);
  if (pending) return pending;
  const task = (async () => {
    let image: string | null = null;
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(6_000) });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (size < MAX_BYTES) {
          const { value, done } = await reader.read();
          if (done || !value) break;
          chunks.push(value);
          size += value.byteLength;
        }
        reader.cancel().catch(() => {});
        image = extractArticleImage(new TextDecoder().decode(Buffer.concat(chunks)));
      }
    } catch {
      image = null;
    }
    cache.set(url, { at: Date.now(), image });
    inflight.delete(url);
    return image;
  })();
  inflight.set(url, task);
  return task;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id") ?? "";
  const ticker = params.get("ticker");
  const company = params.get("company");
  if (!/^[\w-]{1,80}$/.test(id)) return NextResponse.json({ error: "Unknown story." }, { status: 400 });
  try {
    const feed = await loadNews(ticker ? { ticker } : company ? { company } : {});
    const item = feed.items.find((i) => i.id === id);
    if (!item) return NextResponse.json({ image: null }, { headers: { "cache-control": "public, max-age=600, s-maxage=600" } });
    const image = item.image ?? (await articleImage(item.url));
    // Found pictures are good for a day at the edge too; a miss is retried sooner in case the publisher was just slow.
    const ttl = image ? 86_400 : 1_800;
    return NextResponse.json({ image }, { headers: { "cache-control": `public, max-age=${ttl}, s-maxage=${ttl}` } });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ image: null });
  }
}
