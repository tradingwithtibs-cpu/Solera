"use client";

import Link from "next/link";
import { useRoomMessages } from "@/hooks/use-chat";
import { useProfile } from "@/hooks/use-profiles";
import { shortAddress } from "@/lib/investors";
import { formatRelativeTime } from "@/lib/format";
import { ChatIcon } from "./icons";

/**
 * The phone's way into a ticker's room from under the asset card: who
 * spoke last, and how many posts there are. On desktop the room is a
 * grid card (RoomCard) and this link is not shown.
 */
export function ChatRoomCard({ ticker, className = "" }: { ticker: string; className?: string }) {
  const { messages, configured } = useRoomMessages(ticker);
  const last = messages && messages.length > 0 ? messages[messages.length - 1] : null;
  const lastProfile = useProfile(last?.author);
  const count = messages?.length ?? 0;

  return (
    <Link
      href={`/asset/${ticker}/chat`}
      className={`flex min-h-11 items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-panel px-3 py-2.5 transition-colors hover:bg-hover active:bg-hover ${className}`.trim()}
    >
      <span className="avatar sm border-transparent text-white" style={{ background: "var(--grad-action)" }} aria-hidden="true">
        <ChatIcon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block text-fg">{ticker} room</span>
        {messages === null ? (
          <span className="block truncate text-xs text-muted" aria-busy="true">
            Opening the room…
          </span>
        ) : configured === false ? (
          <span className="block truncate text-xs text-muted">Opens once rooms are switched on for this deployment.</span>
        ) : last ? (
          <span className="block truncate text-xs text-muted">
            <span className={`font-semibold text-fg ${lastProfile ? "" : "font-mono"}`}>{lastProfile?.name ?? shortAddress(last.author)}</span>: {last.body} ·{" "}
            {formatRelativeTime(last.createdAt)}
          </span>
        ) : (
          <span className="block truncate text-xs text-muted">Quiet so far. Say what you think of {ticker}.</span>
        )}
      </span>
      <span className="chip shrink-0">{count > 0 ? `${count} →` : "Join →"}</span>
    </Link>
  );
}
