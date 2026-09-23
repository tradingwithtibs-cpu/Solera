import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, requireOwner } from "@/lib/auth-server";
import { normalizeMessageBody, validateMessageBody } from "@/lib/chat";
import { parseTarget } from "@/lib/feed";
import { addComment, listComments } from "@/lib/feed-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/feed/comments?postId= → { comments } oldest first. Anonymous. */
export async function GET(request: NextRequest) {
  try {
    const postId = request.nextUrl.searchParams.get("postId") ?? "";
    if (!UUID.test(postId)) throw new HttpError(400, "Which post?");
    return NextResponse.json({ comments: await listComments(postId) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST /api/feed/comments { postId | newsId | fillId+fillMode, body } → { comment, post }. 280 chars, 3 s cooldown per owner. */
export async function POST(request: NextRequest) {
  try {
    const session = requireOwner(request);
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "Invalid request.");
    }
    const target = parseTarget(body);
    if (!target) throw new HttpError(400, "Say which headline or fill.");
    const raw = typeof body.body === "string" ? body.body : "";
    const problem = validateMessageBody(raw);
    if (problem) throw new HttpError(400, problem);
    return NextResponse.json(await addComment(session.owner, target, normalizeMessageBody(raw)));
  } catch (err) {
    return errorResponse(err);
  }
}
