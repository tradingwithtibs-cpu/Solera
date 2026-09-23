"use client";

import Link from "next/link";
import { useProfile } from "@/hooks/use-profiles";
import { LOBBY_ROOM, roomLabel } from "@/lib/chat";
import { formatRelativeTime } from "@/lib/format";
import { avatarColorFor, shortAddress } from "@/lib/investors";
import { ownerKind } from "@/lib/owner";
import { fillFor } from "@/lib/palette";
import type { FeedMessage } from "./feed";

/**
 * One room post inside a feed list: the room it was said in, who said it,
 * when, and the words. No vote column (rooms are not the posts table) and
 * no thread; "open" goes to the room itself.
 */
export function MessageRow({ item, mine }: { item: FeedMessage; mine: boolean }) {
  const m = item.message;
  const profile = useProfile(m.author);
  const isWallet = ownerKind(m.author) === "wallet";
  const name = mine ? "You" : (profile?.name ?? (isWallet ? shortAddress(m.author) : "Member"));
  const initials = mine ? "ME" : profile?.name ? profile.name.slice(0, 2).toUpperCase() : isWallet ? m.author.slice(0, 2).toUpperCase() : "M";
  const roomHref = m.room === LOBBY_ROOM ? "/" : `/asset/${encodeURIComponent(m.room)}`;
  return (
    <li className="post msg-post" data-sym={m.room === LOBBY_ROOM ? undefined : m.room}>
      {isWallet ? (
        <Link href={`/investor/${m.author}`} className="avatar sm" style={{ background: fillFor(avatarColorFor(m.author), initials) }} aria-label={`${name}'s wallet`}>
          {initials}
        </Link>
      ) : (
        <span className="avatar sm" style={{ background: fillFor(avatarColorFor(m.author), initials) }} aria-hidden="true">
          {initials}
        </span>
      )}
      <div className="post-body">
        <p className="post-meta">
          <Link href={roomHref} className="post-tag">
            {roomLabel(m.room)}
          </Link>
          <b className={profile || mine ? "" : "font-mono"}>{name}</b>
          {profile && !mine && <span className="font-mono">@{profile.handle}</span>}
          <span>· {formatRelativeTime(m.createdAt)}</span>
        </p>
        <p className={`msg-body ${mine ? "mine" : ""}`}>{m.body}</p>
      </div>
    </li>
  );
}
