import { NextResponse, type NextRequest } from "next/server";
import { HttpError } from "@/lib/http-error";
import { loadNews } from "@/lib/news-server";

/**
 * GET /api/news                → general market news
 * GET /api/news?ticker=AAPLx   → the listed company behind an xStock
 * GET /api/news?company=openai → a private company (pre-IPO)
 *
 * A thin wrapper over loadNews(), which the agent's get_news tool calls in-process.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ticker = params.get("ticker");
  const company = params.get("company");
  try {
    const body = await loadNews(ticker ? { ticker } : company ? { company } : {});
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "News unavailable" }, { status: 502 });
  }
}
