import { countUsers } from "@/lib/auth/store";

export const dynamic = "force-dynamic";

/** For the host's health check: is the server up, and can it read its disk? */
export async function GET() {
  try {
    await countUsers();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
