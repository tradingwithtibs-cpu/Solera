import { formatRelativeTime } from "@/lib/format";
import type { ChatMessage } from "@/lib/types";
import { Avatar } from "./Avatar";

export function ChatMessageRow({ message }: { message: ChatMessage }) {
  return (
    <div className="flex items-start gap-2.5">
      <Avatar initials={message.authorInitials} colorClass={message.authorColor} size="sm" />
      <div className="min-w-0 flex-1 rounded-2xl bg-neutral-50 px-3.5 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-semibold text-neutral-900">{message.authorName}</span>
          <span className="shrink-0 text-[10px] text-neutral-400">{formatRelativeTime(message.timestamp)}</span>
        </div>
        <p className="mt-0.5 text-sm text-neutral-700">{message.body}</p>
      </div>
    </div>
  );
}
