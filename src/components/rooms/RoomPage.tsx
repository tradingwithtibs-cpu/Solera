"use client";

import { useRouter } from "next/navigation";
import { getCatalogToken, getTickerInfo, isFeatured, isKnownTicker } from "@/lib/catalog";
import { useCatalog } from "@/hooks/use-catalog";
import { useRoomMessages } from "@/hooks/use-chat";
import { Panel } from "@/components/panels/Panel";
import { ArrowLeftIcon } from "@/components/icons";
import { RoomPanel, roomSubtitle } from "./RoomPanel";

function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-ghost btn-icon btn-small"
      aria-label="Back"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      <ArrowLeftIcon className="h-4 w-4" />
    </button>
  );
}

/**
 * `/asset/[ticker]/chat`: the room full width, for phones and deep links.
 * On desktop the same body is the markets grid's `room` card (RoomCard).
 */
export function RoomPage({ ticker: symbol }: { ticker: string }) {
  const { isLoaded: catalogLoaded } = useCatalog();
  const known = isKnownTicker(symbol) && (isFeatured(symbol) || !!getCatalogToken(symbol));
  const room = useRoomMessages(known ? symbol : undefined);

  if (!known) {
    return (
      <div className="room-page">
        <Panel static title="Room" tools={<BackButton fallback="/markets" />}>
          {catalogLoaded ? (
            <div className="empty-state">
              <h2>We couldn&apos;t find that room.</h2>
              <p>Rooms are one per tokenized stock. Pick one from Markets.</p>
            </div>
          ) : (
            <p className="room-note" aria-busy="true">
              Opening the room…
            </p>
          )}
        </Panel>
      </div>
    );
  }

  const ticker = getTickerInfo(symbol);
  return (
    <div className="room-page">
      <Panel
        static
        title={`${symbol} room`}
        subtitle={roomSubtitle(room.messages, room.configured)}
        tools={<BackButton fallback={`/asset/${symbol}`} />}
        foot={`${ticker.name} · public room · posts are tied to the wallet that wrote them`}
      >
        <RoomPanel ticker={symbol} room={room} />
      </Panel>
    </div>
  );
}
