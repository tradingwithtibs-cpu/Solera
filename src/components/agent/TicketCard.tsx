"use client";

import Link from "next/link";
import { useEffectivePrice } from "@/hooks/use-effective-price";
import { useLivePriceFor } from "@/hooks/use-live-price-for";
import type { AgentCard } from "@/lib/agent/types";
import type { CardState } from "@/hooks/use-agent-chat";
import { money, orderSentence, orderSize, PRACTICE_ORDER_LINE, ticketHref } from "./helpers";

type TicketCardData = Extract<AgentCard, { kind: "ticket" }>;

/**
 * The ORDER CARD (agent-ux §1.7): smaller than a plan card because nothing
 * happens until the ticket's own review step. REVIEW IN TICKET opens the
 * prefilled ticket; it never submits.
 */
export function TicketCard({ card, state, onChange }: { card: TicketCardData; state?: CardState; onChange: (patch: CardState) => void }) {
  useLivePriceFor(card.ticker);
  const { price, isLive } = useEffectivePrice(card.ticker);
  if (state?.status === "discarded") return <p className="agent-stub">discarded</p>;
  const live = card.mode === "live";
  return (
    <section className="agent-card ticket" aria-label="Proposed order">
      <header className="agent-card-head">
        <h3>
          ORDER · {live ? "LIVE" : "PRACTICE"}
        </h3>
        <span className="agent-card-chips">
          <span className={`chip ${live ? "live" : "practice"}`}>{card.mode}</span>
        </span>
      </header>
      <div className="agent-card-body">
        <p className="agent-summary">{orderSentence(card)}</p>
        <p className="agent-line">
          <b>{card.ticker}</b> · now {isLive ? money(price) : "— (no live price right now)"}
          {isLive && ` · ${orderSize(card, price)}`}
        </p>
        {card.note && <p className="agent-line">why: “{card.note}”</p>}
        {!live && <p className="agent-what">{PRACTICE_ORDER_LINE}</p>}
        <div className="agent-actions">
          <Link className="btn-live btn-small" href={ticketHref(card)}>
            Review in ticket
          </Link>
          <button type="button" className="btn-ghost btn-small" onClick={() => onChange({ status: "discarded" })}>
            Discard
          </button>
        </div>
      </div>
    </section>
  );
}
