"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { getCatalogToken, getTickerInfo, isFeatured, isKnownTicker } from "@/lib/catalog";
import { useCatalog } from "@/hooks/use-catalog";
import { useRoomMessages } from "@/hooks/use-chat";
import { useSession } from "@/hooks/use-session";
import { useProfile } from "@/hooks/use-profiles";
import { useConnectWallet } from "@/components/ConnectWalletProvider";
import { MESSAGE_MAX, validateMessageBody } from "@/lib/chat";
import { TopBar } from "@/components/TopBar";
import { ChatMessageRow } from "@/components/ChatMessageRow";
import { ProfileButton } from "@/components/ProfileButton";
import { LoadingState } from "@/components/LoadingState";

/**
 * The room for one tokenized stock. Anyone can read. Posting is tied to a
 * wallet: connect, sign in once (a message signature, no funds involved),
 * and every post carries that wallet. A claimed profile puts a name on it.
 */
export default function AssetChatPage() {
  const { ticker: symbol } = useParams<{ ticker: string }>();
  const { isLoaded: catalogLoaded } = useCatalog();
  const known = isKnownTicker(symbol) && (isFeatured(symbol) || !!getCatalogToken(symbol));
  const { messages, configured, error, send } = useRoomMessages(known ? symbol : undefined);
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58() ?? null;
  const { token, owner, signIn, status: sessionStatus, error: sessionError, canSign } = useSession();
  const profile = useProfile(address);
  const { openConnect } = useConnectWallet();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = messages?.length ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  if (!known) {
    return (
      <div className="flex flex-1 flex-col">
        <TopBar title="Room" />
        {catalogLoaded ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-400">
            We couldn&apos;t find that room.
          </div>
        ) : (
          <LoadingState />
        )}
      </div>
    );
  }

  const ticker = getTickerInfo(symbol);

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

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title={`#${symbol}`} />
      <p className="px-5 pb-2 text-xs text-neutral-400">
        {ticker.name} · public room. Posts are tied to the wallet that wrote them.
      </p>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
        {messages === null ? (
          <p className="pt-10 text-center text-xs text-neutral-400" aria-busy="true">
            Loading the room…
          </p>
        ) : configured === false ? (
          <p className="pt-10 text-center text-xs text-neutral-400">Rooms aren&apos;t switched on for this deployment yet.</p>
        ) : messages.length === 0 ? (
          <p className="pt-10 text-center text-xs text-neutral-400">Nobody has posted in #{symbol} yet. Be the first.</p>
        ) : (
          messages.map((m) => <ChatMessageRow key={m.id} message={m} mine={m.author === owner} />)
        )}
        {error && messages && messages.length > 0 && <p className="text-center text-[11px] text-amber-600">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-100 px-4 py-3">
        {!address ? (
          <button type="button" onClick={openConnect} className="btn-primary w-full">
            Connect a wallet to post
          </button>
        ) : !token ? (
          <div>
            <button type="button" onClick={signIn} disabled={sessionStatus === "signing" || !canSign} className="btn-primary w-full disabled:opacity-50">
              {sessionStatus === "signing" ? "Waiting for your wallet…" : "Sign in to post"}
            </button>
            <p className="mt-2 text-center text-[11px] leading-relaxed text-neutral-400">
              One signature, good for 30 days. It can&apos;t move funds.
            </p>
            {sessionError && (
              <p role="alert" className="mt-1 text-center text-xs text-rose-600">
                {sessionError}
              </p>
            )}
          </div>
        ) : (
          <>
            {profile === null && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-violet-50 px-3 py-2 text-[11px] text-violet-700">
                <span>Posting as your wallet address.</span>
                <ProfileButton className="shrink-0 font-semibold underline" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="field flex flex-1 items-center rounded-full bg-neutral-100 px-4">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend();
                  }}
                  placeholder={`Message #${symbol}`}
                  aria-label={`Message the ${symbol} room`}
                  maxLength={MESSAGE_MAX}
                  disabled={sending}
                  className="w-full bg-transparent py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
                />
              </div>
              <button type="button" onClick={handleSend} disabled={!draft.trim() || sending} className="btn-primary shrink-0 disabled:opacity-40">
                {sending ? "…" : "Send"}
              </button>
            </div>
            {sendError && (
              <p role="alert" className="mt-1 text-xs text-rose-600">
                {sendError}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
