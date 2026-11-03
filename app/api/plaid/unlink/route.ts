import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { unlinkAccount } from "@/lib/money/plaid";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const itemId = body?.itemId;
  if (typeof itemId !== "string") {
    return NextResponse.json({ error: "Missing itemId." }, { status: 400 });
  }
  await unlinkAccount(itemId);
  return NextResponse.json({ ok: true });
}
