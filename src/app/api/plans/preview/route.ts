import { NextResponse, type NextRequest } from "next/server";
import { makeResolver, parsePlanSentence } from "@/lib/plan-parser";
import { describe } from "@/lib/plans";
import { getCatalog } from "@/lib/catalog-server";
import { XSTOCK_TOKENS } from "@/lib/tokens";
import { TICKERS } from "@/lib/mock-data";

/** POST /api/plans/preview { text } → what Solera read: a condition and its summary, or the next question. No model involved. */
export async function POST(request: NextRequest) {
  let body: { text?: string };
  try {
    body = (await request.json()) as { text?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.slice(0, 280) : "";
  const entries = [
    ...Object.keys(XSTOCK_TOKENS).map((symbol) => ({ symbol, name: (TICKERS as Record<string, { name?: string }>)[symbol]?.name })),
    ...(await getCatalog().catch(() => [])).map((t) => ({ symbol: t.symbol, name: t.name })),
  ];
  const parsed = parsePlanSentence(text, { resolveTicker: makeResolver(entries) });
  return NextResponse.json({
    condition: parsed.condition ?? null,
    summary: parsed.condition ? describe(parsed.condition) : null,
    question: parsed.question ?? null,
    partial: parsed.partial,
  });
}
