import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, HttpError, requireOwner } from "@/lib/auth-server";
import { parseTarget, parseVoteDir } from "@/lib/feed";
import { setVote } from "@/lib/feed-server";

/** POST /api/feed/vote { postId | newsId | fillId+fillMode, dir: -1|0|1 } → { post }. 0 removes the vote. */
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
    const dir = parseVoteDir(body.dir);
    if (!target || dir === null) throw new HttpError(400, "Say what to vote on, and which way.");
    return NextResponse.json({ post: await setVote(session.owner, target, dir) });
  } catch (err) {
    return errorResponse(err);
  }
}
