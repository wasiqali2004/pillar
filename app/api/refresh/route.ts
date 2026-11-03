import { syncEveryone } from "@/lib/sync/scheduler";

export const dynamic = "force-dynamic";

/**
 * Lets an outside scheduler pull every user's sources: for hosts that freeze the
 * server between requests, or scripts/run-pillar.ps1 on a home machine. The
 * secret stops anyone else from triggering it. It refuses when none is set.
 */
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET ?? process.env.PILLAR_CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("x-pillar-key") === secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authorized(req)) return new Response("Forbidden", { status: 403 });
  return Response.json(await syncEveryone());
}

/** Vercel Cron sends a GET with the Bearer header. */
export const GET = POST;
