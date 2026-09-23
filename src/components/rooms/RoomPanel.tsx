"use client";

import "./rooms.css";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRoomMessages } from "@/hooks/use-chat";
import { useSession } from "@/hooks/use-session";
import { useProfile } from "@/hooks/use-profiles";
import { useConnectWallet } from "@/components/ConnectWalletProvider";
import { MESSAGE_MAX, validateMessageBody } from "@/lib/chat";
import { avatarColorFor } from "@/lib/investors";
import { fillFor } from "@/lib/palette";
import type { ChatMessage } from "@/lib/types";
import { ChatMessageRow } from "@/components/ChatMessageRow";
import { ProfileButton } from "@/components/ProfileButton";
import { Panel } from "@/components/panels/Panel";

export type RoomState = ReturnType<typeof useRoomMessages>;

/** The head line under `// {SYM} ROOM`. */
export function roomSubtitle(messages: ChatMessage[] | null, configured: boolean | null): string {
  if (configured === false) return "rooms are off for this deployment";
  if (messages === null) return "opening the room…";
  const n = messages.length;
  return `${n} ${n === 1 ? "message" : "messages"} · wallet sign-in to post`;
}

/**
 * The `room` card of the markets grid: one subscription, the count in the
 * head, the body below. `id` is forwarded so PanelGrid can place it.
 */
export function RoomCard({ ticker, id = "room" }: { ticker: string; id?: string }) {
  const room = useRoomMessages(ticker);
  return (
    <Panel id={id} title={`${ticker} room`} subtitle={roomSubtitle(room.messages, room.configured)}>
      <RoomPanel ticker={ticker} room={room} />
    </Panel>
  );
}

/**
 * A ticker's room: the list, then the gate (connect → sign in → post).
 * Anyone can read. Posting is tied to a wallet: connect, sign in once (a
 * message signature, no funds involved), and every post carries that
 * wallet. A claimed profile puts a name on it. The caller owns the
 * `useRoomMessages` subscription so the card head can show the count.
 */
export function RoomPanel({ ticker, room, label: labelProp }: { ticker: string; room: RoomState; label?: string }) {
  const { messages, configured, error, send } = room;
  // "#TSLAx" for a ticker room; the lobby passes its own name.
  const label = labelProp ?? `#${ticker}`;
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58() ?? null;
  const { token, owner, kind, signIn, status: sessionStatus, error: sessionError, canSign } = useSession();
  const profile = useProfile(owner ?? address);
  const { openConnect } = useConnectWallet();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const count = messages?.length ?? 0;

  // Keep the newest post in view; scroll the list only, never the page.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [count]);

  const handleSend = async () => {
    if (!token || sending) return;
    const problem = validateMessageBody(draft);
    if (problem) {
      setSendError(problem);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      await send(draft, token);
      setDraft("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Couldn't post that.");
    } finally {
      setSending(false);
    }
  };

  const me = owner ?? address ?? "";
  const myInitials = profile?.name ? profile.name.slice(0, 2).toUpperCase() : me ? me.slice(0, 2).toUpperCase() : "?";

  return (
    <div className="room">
      <ul ref={listRef} className="room-list" aria-label={`Posts in ${label}`}>
        {messages === null ? (
          <li className="room-note" aria-busy="true">
            Opening the room…
          </li>
        ) : configured === false ? (
          <li className="room-note">Rooms aren&apos;t switched on for this deployment yet.</li>
        ) : messages.length === 0 ? (
          <li className="room-note">Nobody has posted in {label} yet. Be the first.</li>
        ) : (
          messages.map((m) => <ChatMessageRow key={m.id} message={m} mine={!!owner && m.author === owner} />)
        )}
        {error && messages && messages.length > 0 && (
          <li className="room-note warn" role="status">
            {error}
          </li>
        )}
      </ul>

      <div className="border-t border-line-soft pt-3">
        {token ? (
          <>
            {profile === null && (
              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted">
                <span>{kind === "user" ? "Posting as a member." : "Posting as your wallet address."}</span>
                <ProfileButton className="btn-secondary btn-small shrink-0" />
              </div>
            )}
            <form
              className="room-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <span className="avatar xs" style={{ background: fillFor(avatarColorFor(me || ticker), myInitials) }} aria-hidden="true">
                {myInitials}
              </span>
              <div className="field">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Say something in ${label}…`}
                  aria-label={`Message ${label}`}
                  maxLength={MESSAGE_MAX}
                  disabled={sending}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={!draft.trim() || sending} aria-busy={sending}>
                {sending ? "…" : "Post"}
              </button>
            </form>
            {sendError && (
              <p role="alert" className="field-error">
                {sendError}
              </p>
            )}
          </>
        ) : address ? (
          <div>
            <button
              type="button"
              onClick={signIn}
              disabled={sessionStatus === "signing" || !canSign}
              aria-busy={sessionStatus === "signing"}
              className="btn-live w-full"
            >
              {sessionStatus === "signing" ? "Waiting for your wallet…" : "Sign in to post"}
            </button>
            <p className="mt-2 text-center text-[11px] leading-relaxed text-muted">One signature, good for 30 days. It can&apos;t move funds.</p>
            {sessionError && (
              <p role="alert" className="field-error text-center">
                {sessionError}
              </p>
            )}
          </div>
        ) : (
          <button type="button" onClick={openConnect} className="btn-primary w-full">
            Connect a wallet to post
          </button>
        )}
      </div>
    </div>
  );
}
