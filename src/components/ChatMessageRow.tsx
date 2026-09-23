"use client";

import { formatRelativeTime } from "@/lib/format";
import { avatarColorFor, shortAddress } from "@/lib/investors";
import { fillFor } from "@/lib/palette";
import { ownerKind } from "@/lib/owner";
import { useProfile } from "@/hooks/use-profiles";
import type { ChatMessage } from "@/lib/types";

/**
 * One post, in the partner's room-list layout: initials tile, then the
 * claimed name (or short address) with the age, then the body in an inset
 * box. Renders as a list item; RoomPanel's `.room-list` is the `ul`.
 */
export function ChatMessageRow({ message, mine = false }: { message: ChatMessage; mine?: boolean }) {
  const profile = useProfile(message.author);
  const isWallet = ownerKind(message.author) === "wallet";
  const name = profile?.name ?? (isWallet ? shortAddress(message.author) : "Member");
  const initials = profile?.name ? profile.name.slice(0, 2).toUpperCase() : isWallet ? message.author.slice(0, 2).toUpperCase() : "M";
  return (
    <li className="room-msg">
      <span className="avatar xs" style={{ background: fillFor(avatarColorFor(message.author), initials) }} aria-hidden="true">
        {initials}
      </span>
      <div className="min-w-0">
        <b className="flex min-w-0 items-baseline gap-1.5 text-xs font-semibold text-fg">
          <span className={`truncate ${profile ? "" : "font-mono"}`}>{name}</span>
          {profile && <span className="truncate font-mono text-[10px] font-medium text-muted">@{profile.handle}</span>}
          <small className="shrink-0 font-mono text-[10px] font-medium text-muted">{formatRelativeTime(message.createdAt)}</small>
        </b>
        <p
          className={`mt-1 break-words rounded-[var(--radius-control)] border px-2.5 py-2 text-xs leading-relaxed text-fg ${
            mine ? "border-line-strong bg-selected" : "border-line bg-inset"
          }`}
        >
          {message.body}
        </p>
      </div>
    </li>
  );
}
