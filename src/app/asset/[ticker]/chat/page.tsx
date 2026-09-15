"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { MY_PROFILE, TICKERS } from "@/lib/mock-data";
import { useRoomMessages } from "@/hooks/use-chat";
import type { TickerSymbol } from "@/lib/types";
import { TopBar } from "@/components/TopBar";
import { ChatMessageRow } from "@/components/ChatMessageRow";

export default function AssetChatPage() {
  const params = useParams<{ ticker: string }>();
  const symbol = params.ticker as TickerSymbol;
  const ticker = TICKERS[symbol];
  const { messages, isLoaded, sendMessage } = useRoomMessages(symbol);
  const [draft, setDraft] = useState("");

  if (!ticker) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title="Chat" />
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-400">
          We couldn&apos;t find that room.
        </div>
      </div>
    );
  }

  const handleSend = () => {
    const body = draft.trim();
    if (!body) return;
    sendMessage(body, {
      name: MY_PROFILE.name,
      initials: MY_PROFILE.initials,
      avatarColor: MY_PROFILE.avatarColor,
    });
    setDraft("");
  };

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title={`${symbol} chat`} />

      <div className="mx-5 mb-1 mt-1 rounded-xl bg-neutral-50 px-4 py-2 text-center text-[11px] text-neutral-400">
        Demo chat — messages are only visible in your own browser.
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
        {!isLoaded || messages === null ? null : messages.length === 0 ? (
          <p className="pt-10 text-center text-xs text-neutral-400">No messages yet. Say something first.</p>
        ) : (
          messages.map((m) => <ChatMessageRow key={m.id} message={m} />)
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-100 px-4 py-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={`Message #${symbol}`}
          aria-label={`Message the ${symbol} chat room`}
          className="flex-1 rounded-full bg-neutral-100 px-4 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!draft.trim()}
          className="btn-primary shrink-0 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
