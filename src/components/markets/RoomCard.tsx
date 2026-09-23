"use client";

import { Panel } from "@/components/panels/Panel";
import { useRoomMessages } from "@/hooks/use-chat";
import { getCatalogToken, isFeatured, isKnownTicker } from "@/lib/catalog";
import { RoomLink } from "./RoomLink";

interface Props {
  id: string;
  ticker: string;
  /** False while the card is hidden and the asset card carries the room link instead (the phone's Trade tab), so the room is subscribed once. */
  active?: boolean;
}

/**
 * The selected ticker's room. Rooms exist for tokenized stocks; the body is
 * the link card until the room component (task R6) replaces it.
 */
export function RoomCard({ id, ticker, active = true }: Props) {
  const hasRoom = isKnownTicker(ticker) && (isFeatured(ticker) || !!getCatalogToken(ticker));
  if (!hasRoom) {
    return (
      <Panel id={id} title={`${ticker} room`}>
        <p className="asset-note">Rooms are for tokenized stocks. Pick an xStock in Markets to open its room.</p>
      </Panel>
    );
  }
  if (!active) {
    return (
      <Panel id={id} title={`${ticker} room`} subtitle="wallet sign-in to post">
        <p className="asset-note">The room is under the asset on this tab.</p>
      </Panel>
    );
  }
  return <LiveRoomCard id={id} ticker={ticker} />;
}

function LiveRoomCard({ id, ticker }: { id: string; ticker: string }) {
  const { messages, configured } = useRoomMessages(ticker);
  const n = messages?.length ?? 0;
  const subtitle =
    messages === null ? "opening the room…" : configured === false ? "not switched on here" : `${n} ${n === 1 ? "message" : "messages"} · wallet sign-in to post`;
  return (
    <Panel id={id} title={`${ticker} room`} subtitle={subtitle}>
      <RoomLink ticker={ticker} messages={messages} configured={configured} />
    </Panel>
  );
}
