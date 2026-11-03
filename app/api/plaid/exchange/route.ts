import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { bankLimitReached, linkAccount, syncMoney } from "@/lib/money/plaid";
import { clearUnlinkNotice } from "@/lib/activity";
import { getPlan } from "@/lib/dashboard/prefs";
import { BILLING_LIVE, bankSyncAllowed, MAX_LINKED_BANKS } from "@/lib/dashboard/catalog";

export const runtime = "nodejs";

/** Called by /connect-money right after Plaid Link's onSuccess fires. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!bankSyncAllowed(await getPlan(), user.isOwner)) {
    return NextResponse.json(
      { error: BILLING_LIVE ? "Automatic bank sync is part of Pro." : "Automatic bank sync isn't available yet. Upload a statement instead." },
      { status: 402 },
    );
  }
  if (await bankLimitReached()) {
    return NextResponse.json(
      { error: `You've linked ${MAX_LINKED_BANKS} accounts, the most that can be linked. Disconnect one to add another.` },
      { status: 409 },
    );
  }
  const body = await request.json().catch(() => null);
  const publicToken = body?.publicToken;
  const institutionName = body?.institutionName ?? null;

  if (typeof publicToken !== "string") {
    return NextResponse.json({ error: "Missing publicToken." }, { status: 400 });
  }

  try {
    const { itemId } = await linkAccount(publicToken, institutionName);
    // Backfill immediately so the Money tile has something to show on the way
    // back to the dashboard, same as Google Health's callback does.
    try {
      await syncMoney();
    } catch {}
    await clearUnlinkNotice();
    return NextResponse.json({ ok: true, itemId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
