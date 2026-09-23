"use client";

import Link from "next/link";
import { useRoomMessages } from "@/hooks/use-chat";
import { useProfile } from "@/hooks/use-profiles";
import { shortAddress } from "@/lib/investors";
import { formatRelativeTime } from "@/lib/format";
import { ChatIcon } from "@/components/icons";
import type { ChatMessage } from "@/lib/types";

/** The way into a ticker's room: who spoke last and how many posts there are. Presentational; the caller owns the subscription. */
export function RoomLink({ ticker, messages, configured }: { ticker: string; messages: ChatMessage[] | null; configured: boolean | null }) {
  const last = messages && messages.length > 0 ? messages[messages.length - 1] : null;
  const lastProfile = useProfile(last?.author);
  return (
    <Link href={`/asset/${ticker}/chat`} className="room-link">
      <span className="room-link-icon" aria-hidden="true">
        <ChatIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <b>#{ticker} room</b>
        {messages === null ? (
          <small aria-busy="true">Opening the room…</small>
        ) : configured === false ? (
          <small>Rooms aren&apos;t switched on for this deployment yet.</small>
        ) : last ? (
          <small>
            <span className={lastProfile ? "" : "font-mono"}>{lastProfile?.name ?? shortAddress(last.author)}</span>: {last.body} · {formatRelativeTime(last.createdAt)}
          </small>
        ) : (
          <small>Nobody has posted in #{ticker} yet. Be the first.</small>
        )}
      </span>
      <em>{messages && messages.length > 0 ? `${messages.length} →` : "Join →"}</em>
    </Link>
  );
}

/**
 * One live subscription to a room, rendered as the link card. A room's
 * realtime channel can be subscribed once per page, so exactly one of
 * these mounts per ticker at a time (the room card on desktop and the
 * Markets tab, the asset card on the phone's Trade tab).
 */
export function LiveRoomLink({ ticker }: { ticker: string }) {
  const { messages, configured } = useRoomMessages(ticker);
  return <RoomLink ticker={ticker} messages={messages} configured={configured} />;
}
