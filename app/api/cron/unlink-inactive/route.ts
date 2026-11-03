import { NextResponse, type NextRequest } from "next/server";
import { unlinkInactiveEveryone } from "@/lib/sync/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The server does this by itself once a day (lib/sync/scheduler.ts). This route
 * is for hosts that freeze between requests: their scheduler sends
 * `Authorization: Bearer $CRON_SECRET`. With no secret set it refuses to run, so
 * it can't be triggered by a stranger.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? process.env.PILLAR_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET isn't set." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await unlinkInactiveEveryone());
}
