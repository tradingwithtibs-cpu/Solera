import { INVESTORS } from "./mock-data";
import type { ChatMessage, TickerSymbol } from "./types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function investor(id: string) {
  const found = INVESTORS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown investor id in chat seed data: ${id}`);
  return found;
}

function message(investorId: string, body: string, ageMs: number): Omit<ChatMessage, "id" | "roomId"> {
  const author = investor(investorId);
  return {
    authorName: author.name,
    authorInitials: author.initials,
    authorColor: author.avatarColor,
    body,
    timestamp: Date.now() - ageMs,
  };
}

const SEEDS: Record<TickerSymbol, Omit<ChatMessage, "id" | "roomId">[]> = {
  TSLAx: [
    message("elena-volkov", "All in here. Robotaxi timeline is the only thing that matters to me.", 2 * DAY),
    message("maya-chen", "Long since before the split — feels like this has more room to run.", 1 * DAY),
    message("priya-patel", "Watching next quarter's delivery numbers closely before adding more.", 5 * HOUR),
    message("sam-osei", "Trimmed a little after the run-up, still core position though.", 40 * 60 * 1000),
  ],
  AAPLx: [
    message("priya-patel", "Services margin keeps expanding — this is a boring compounder and I mean that as a compliment.", 3 * DAY),
    message("jordan-blake", "Small position for me, mostly here for the diversification.", 1 * DAY),
    message("maya-chen", "Waiting for a pullback before adding more.", 6 * HOUR),
  ],
  SPYx: [
    message("jordan-blake", "Boring and I like it that way. DCA every week no matter what.", 2 * DAY),
    message("sam-osei", "Rebalanced into more SPYx this month after the rough quarter.", 1 * DAY),
    message("elena-volkov", "Not really my style but I get why people like the stability.", 8 * HOUR),
  ],
  NVDAx: [
    message("maya-chen", "Every robot needs a brain. This is the least risky way to bet on that.", 1 * DAY),
    message("priya-patel", "Valuation makes me nervous but the moat is real.", 7 * HOUR),
  ],
  AMZNx: [
    message("jordan-blake", "Added a small AMZNx position, mostly for AWS exposure.", 1 * DAY),
  ],
  GOOGLx: [
    message("priya-patel", "Search plus cloud plus the model lab, undervalued as a bundle.", 20 * HOUR),
  ],
  METAx: [
    message("elena-volkov", "Small position here, TSLAx is still where the real bet is.", 15 * HOUR),
  ],
  COINx: [
    message("sam-osei", "Figured I should have some crypto-adjacent exposure given where we all are.", 10 * HOUR),
  ],
};

/**
 * Deterministic fake conversation for a ticker's room. Demo-only: this is
 * not persisted until someone actually sends a message (see use-chat.ts),
 * so it's recomputed each time from these fixed bodies — only the "time
 * ago" display drifts slightly between calls, which is invisible in
 * practice.
 */
export function seedMessagesForRoom(roomId: TickerSymbol): ChatMessage[] {
  return SEEDS[roomId].map((m, i) => ({ ...m, id: `seed_${roomId}_${i}`, roomId }));
}
