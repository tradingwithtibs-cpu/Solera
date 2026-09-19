"use client";

import { formatRelativeTime } from "@/lib/format";
import { avatarColorFor, shortAddress } from "@/lib/investors";
import { useProfile } from "@/hooks/use-profiles";
import type { ChatMessage } from "@/lib/types";
import { Avatar } from "./Avatar";

/** One post: the wallet's claimed name and handle when it has a profile, its short address otherwise. */
export function ChatMessageRow({ message, mine = false }: { message: ChatMessage; mine?: boolean }) {
  const profile = useProfile(message.wallet);
  const name = profile?.name ?? shortAddress(message.wallet);
  const initials = profile?.name ? profile.name.slice(0, 2).toUpperCase() : message.wallet.slice(0, 2).toUpperCase();
  return (
    <div className="flex items-start gap-2.5">
      <Avatar initials={initials} colorClass={avatarColorFor(message.wallet)} size="sm" />
      <div className={`min-w-0 flex-1 rounded-2xl px-3.5 py-2.5 ${mine ? "bg-violet-50" : "bg-neutral-50"}`}>
        <div className="flex items-baseline gap-2">
          <span className={`truncate text-xs font-semibold text-neutral-900 ${profile ? "" : "font-mono"}`}>{name}</span>
          {profile && <span className="truncate text-[10px] text-neutral-400">@{profile.handle}</span>}
          <span className="ml-auto shrink-0 text-[10px] text-neutral-400">{formatRelativeTime(message.createdAt)}</span>
        </div>
        <p className="mt-0.5 break-words text-sm text-neutral-700">{message.body}</p>
      </div>
    </div>
  );
}
