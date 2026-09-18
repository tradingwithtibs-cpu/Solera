import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog-server";

/** Every tokenized stock on Solana with mint, price, liquidity and 24h change. Most liquid first. */
export async function GET() {
  try {
    const tokens = await getCatalog();
    return NextResponse.json({ tokens, fetchedAt: Date.now() });
  } catch {
    return NextResponse.json({ error: "Catalog unavailable" }, { status: 502 });
  }
}
