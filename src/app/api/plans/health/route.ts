import { after, NextResponse } from "next/server";
import { nudgeEvaluator, planHealth } from "@/lib/plans-server";
import { errorResponse } from "@/lib/auth-server";

export const maxDuration = 30;

/**
 * GET /api/plans/health → when the watcher last ran and whether it is alive (within 3 minutes).
 * Every open tab asks once a minute; when the scheduled watcher is quiet the
 * answer goes out first and this request then runs the shared pass itself.
 */
export async function GET() {
  try {
    const health = await planHealth();
    after(async () => {
      try {
        await nudgeEvaluator(health.lastEvaluatedAt);
      } catch (err) {
        console.warn("plans: shared pass from the health poll failed", err instanceof Error ? err.message : err);
      }
    });
    return NextResponse.json(health);
  } catch (err) {
    return errorResponse(err);
  }
}
