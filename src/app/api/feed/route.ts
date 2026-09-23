import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/auth-server";
import { sessionFromHeader } from "@/lib/session-server";
import { parseFeedQuery } from "@/lib/feed";
import { listFeed } from "@/lib/feed-server";

/** GET /api/feed?sort=hot|new&ticker=AAPLx&cursor=&limit=30 → { posts, next }. Anonymous; myVote only with a session. */
export async function GET(request: NextRequest) {
  try {
    const session = sessionFromHeader(request.headers.get("authorization"));
    const q = parseFeedQuery(request.nextUrl.searchParams);
    return NextResponse.json(await listFeed({ ...q, owner: session?.owner ?? null }));
  } catch (err) {
    return errorResponse(err);
  }
}
