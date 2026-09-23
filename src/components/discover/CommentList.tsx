"use client";

import Link from "next/link";
import { useComments } from "@/hooks/use-feed";
import { formatRelativeTime } from "@/lib/format";
import { avatarColorFor } from "@/lib/investors";
import { ownerKind } from "@/lib/owner";
import { commentAuthor, commentInitials } from "./feed-posts";

/**
 * The thread under a story or a fill, oldest first: initials, the name
 * (claimed profile, handle, short wallet; "You" for the person's own), the
 * age and the body. `postId` is null until someone has voted or commented,
 * and then the thread is simply empty.
 */
export function CommentList({ postId, me }: { postId: string | null; me: string | null }) {
  const thread = useComments(postId);

  if (!thread.isLoaded) {
    return (
      <div className="cmt-skeleton" aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} className="skeleton" />
        ))}
      </div>
    );
  }

  return (
    <>
      {thread.error && (
        <p className="tr-empty warn" role="status">
          {thread.error}
        </p>
      )}
      {thread.items.length === 0 ? (
        <p className="tr-empty">No comments yet. Be the first.</p>
      ) : (
        <ul className="cmt-list">
          {thread.items.map((c) => {
            const name = commentAuthor(c, me);
            const wallet = ownerKind(c.owner) === "wallet" ? c.owner : null;
            return (
              <li key={c.id} className="cmt">
                <span className="avatar xs" style={{ "--tk": avatarColorFor(c.owner) } as React.CSSProperties} aria-hidden="true">
                  {commentInitials(c, me)}
                </span>
                <div className="cmt-body">
                  <p className="cmt-meta">
                    {wallet && name !== "You" ? (
                      <Link href={`/investor/${wallet}`}>
                        <b>{name}</b>
                      </Link>
                    ) : (
                      <b>{name}</b>
                    )}{" "}
                    <small>· {formatRelativeTime(c.createdAt)}</small>
                  </p>
                  <p className="cmt-text">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
