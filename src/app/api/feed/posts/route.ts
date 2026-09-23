import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, requireOwner } from "@/lib/auth-server";
import { parseTarget } from "@/lib/feed";
import { resolvePost } from "@/lib/feed-server";

/** POST /api/feed/posts { newsId | fillId + fillMode } → { post } — the post a headline or fill becomes, made on first contact. Session required so nobody mints posts anonymously. */
export async function POST(request: NextRequest) {
  try {
    requireOwner(request);
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    const target = parseTarget(body);
    if (!target) throw new HttpError(400, "Say which headline or fill.");
    const row = await resolvePost(target);
    return NextResponse.json({ post: { id: row.id, kind: row.kind, ticker: row.ticker, title: row.title, score: row.score, commentCount: row.comment_count } });
  } catch (err) {
    return errorResponse(err);
  }
}
