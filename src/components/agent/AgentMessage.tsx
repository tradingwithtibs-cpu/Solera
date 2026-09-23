"use client";

import type { AgentCard } from "@/lib/agent/types";
import type { AgentError, AgentTurn, CardState } from "@/hooks/use-agent-chat";
import { PlanCard } from "./PlanCard";
import { TicketCard } from "./TicketCard";
import { NewsCard } from "./NewsCard";
import { PricesCard } from "./PricesCard";
import { PlansCard } from "./PlansCard";
import { ExplainCard } from "./ExplainCard";
import { describeDraft, eyebrowFor } from "./helpers";

interface Props {
  turn: AgentTurn;
  /** The last turn in the thread: it carries the spinner, the thinking row and the error row. */
  isLast: boolean;
  inFlight: boolean;
  error: AgentError | null;
  onRetry: () => void;
  onCard: (index: number, patch: CardState) => void;
}

function CardView({ card, state, onChange }: { card: AgentCard; state?: CardState; onChange: (patch: CardState) => void }) {
  switch (card.kind) {
    case "plan":
      return <PlanCard card={card} state={state} onChange={onChange} />;
    case "ticket":
      return <TicketCard card={card} state={state} onChange={onChange} />;
    case "news":
      return <NewsCard card={card} />;
    case "prices":
      return <PricesCard card={card} />;
    case "plans":
      return <PlansCard card={card} />;
    case "explain":
      return <ExplainCard card={card} />;
    default:
      return null;
  }
}

/**
 * One turn (agent-ux §1.5). User turns sit right on --ink-raised; assistant
 * turns carry the `from {tools}` eyebrow, the offline-parser chip when the
 * mock answered, the Lens-style bubble, the visible draft line, then the
 * cards in order. Cards read only card data, never the prose.
 */
export function AgentMessage({ turn, isLast, inFlight, error, onRetry, onCard }: Props) {
  if (turn.role === "user") {
    const waiting = isLast && inFlight;
    return (
      <div className="agent-turn user">
        <div className="agent-bubble user">
          {turn.text}
          {waiting && <span className="agent-spin" aria-hidden="true" />}
        </div>
        {waiting && (
          <p className="agent-thinking" aria-label="Thinking">
            …
          </p>
        )}
        {isLast && !inFlight && error && (
          <p role="alert" className="agent-error">
            {error.message}
            <button type="button" className="btn-ghost btn-small" onClick={onRetry}>
              Retry
            </button>
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="agent-turn assistant">
      <p className="agent-meta">
        <span className="eyebrow">{eyebrowFor(turn.toolTrace, turn.cards)}</span>
        {turn.model === "mock" && <span className="chip">offline parser</span>}
      </p>
      {turn.text && <div className="agent-bubble assistant">{turn.text}</div>}
      {turn.pendingDraft && <p className="agent-draft">draft · {describeDraft(turn.pendingDraft)}</p>}
      {turn.cards?.map((card, i) => (
        <CardView key={i} card={card} state={turn.cardState?.[i]} onChange={(patch) => onCard(i, patch)} />
      ))}
    </div>
  );
}
