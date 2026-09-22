"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseAnon } from "@/lib/supabase";
import { mergeMessages, rowToMessage, type MessageRow } from "@/lib/chat";
import { requestProfiles } from "./use-profiles";
import type { ChatMessage } from "@/lib/types";

const POLL_MS = 4_000;

/**
 * A ticker's room, live. Messages arrive two ways: a poll every few
 * seconds (always), and a Supabase Realtime subscription when the
 * deployment has one (instant). Both feed the same deduplicated list.
 * Posting goes through /api/chat with the caller's session token.
 */
export function useRoomMessages(room: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which room the latest effect is for, so a response from a room we've since left is dropped.
  const roomRef = useRef(room);

  const append = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length > 0) requestProfiles(incoming.map((m) => m.author));
    setMessages((prev) => mergeMessages(prev ?? [], incoming));
  }, []);

  const load = useCallback(async () => {
    if (!room) return;
    try {
      const res = await fetch(`/api/chat?room=${encodeURIComponent(room)}`, { cache: "no-store" });
      const data = (await res.json()) as { messages?: ChatMessage[]; configured?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Chat unavailable (${res.status})`);
      if (roomRef.current !== room) return;
      setConfigured(data.configured ?? false);
      setError(null);
      const list = data.messages ?? [];
      requestProfiles(list.map((m) => m.author));
      setMessages((prev) => mergeMessages(prev ?? [], list));
    } catch (err) {
      if (roomRef.current !== room) return;
      setError(err instanceof Error ? err.message : "Chat unavailable");
      setMessages((prev) => prev ?? []);
    }
  }, [room]);

  useEffect(() => {
    roomRef.current = room;
    if (!room) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(null);
    // Fetch on mount, then poll while the tab is visible; setState only after the network round trip.
    load();
    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);

    // Realtime: instant delivery when the table is in the publication (see supabase/chat.sql).
    const supabase = getSupabaseAnon();
    const channel = supabase
      ?.channel(`room:${room}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room=eq.${room}` }, (payload) => {
        append([rowToMessage(payload.new as MessageRow)]);
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      if (channel) supabase?.removeChannel(channel);
    };
  }, [room, load, append]);

  const send = useCallback(
    async (body: string, token: string) => {
      if (!room) throw new Error("No room.");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ room, body }),
      });
      const data = (await res.json()) as { message?: ChatMessage; error?: string };
      if (!res.ok || !data.message) throw new Error(data.error ?? "Couldn't post that.");
      append([data.message]);
      return data.message;
    },
    [room, append],
  );

  return { messages, configured, error, send, refresh: load };
}
