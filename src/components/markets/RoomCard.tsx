"use client";

import { Panel } from "@/components/panels/Panel";
import { useRoomMessages } from "@/hooks/use-chat";
import { getCatalogToken, isFeatured, isKnownTicker } from "@/lib/catalog";
import { RoomPanel, roomSubtitle } from "@/components/rooms/RoomPanel";

interface Props {
  id: string;
  ticker: string;
  /** False while the card is hidden and the asset card carries the room link instead (the phone's Trade tab), so the room is subscribed once. */
  active?: boolean;
}

/**
 * The selected ticker's room. Rooms exist for tokenized stocks; the body is
 * the room itself (messages, the sign-in gate, the composer) with one
 * subscription owned here so the head can show the count.
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
  const room = useRoomMessages(ticker);
  return (
    <Panel id={id} title={`${ticker} room`} subtitle={roomSubtitle(room.messages, room.configured)} bodyClassName="room-card-body">
      <RoomPanel ticker={ticker} room={room} />
    </Panel>
  );
}
