"use client";

import Link from "next/link";
import { useRoomMessages } from "@/hooks/use-chat";
import { useProfile } from "@/hooks/use-profiles";
import { shortAddress } from "@/lib/investors";
import { formatRelativeTime } from "@/lib/format";
import { ChatIcon } from "./icons";

/** The way into a ticker's room from its asset page: who spoke last, and how many posts there are. */
export function ChatRoomCard({ ticker }: { ticker: string }) {
  const { messages, configured } = useRoomMessages(ticker);
  const last = messages && messages.length > 0 ? messages[messages.length - 1] : null;
  const lastProfile = useProfile(last?.wallet);

  return (
    <Link
      href={`/asset/${ticker}/chat`}
      className="mx-5 mt-2 flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 active:bg-neutral-50"
    >
      <span className="bg-gradient-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white">
        <ChatIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-900">#{ticker} room</p>
        {messages === null ? (
          <p className="text-xs text-neutral-400" aria-busy="true">
            Opening the room…
          </p>
        ) : configured === false ? (
          <p className="text-xs text-neutral-400">Opens once rooms are switched on for this deployment.</p>
        ) : last ? (
          <p className="truncate text-xs text-neutral-500">
            <span className={`font-semibold text-neutral-700 ${lastProfile ? "" : "font-mono"}`}>
              {lastProfile?.name ?? shortAddress(last.wallet)}
            </span>
            : {last.body} · {formatRelativeTime(last.createdAt)}
          </p>
        ) : (
          <p className="text-xs text-neutral-500">Quiet so far. Say what you think of {ticker}.</p>
        )}
      </div>
      <span className="shrink-0 text-xs font-semibold text-indigo-600">
        {messages && messages.length > 0 ? `${messages.length} →` : "Join →"}
      </span>
    </Link>
  );
}
