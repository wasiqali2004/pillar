import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { bankLimitReached, createLinkToken, plaidConfig } from "@/lib/money/plaid";
import { getPlan } from "@/lib/dashboard/prefs";
import { BILLING_LIVE, bankSyncAllowed, MAX_LINKED_BANKS } from "@/lib/dashboard/catalog";

export const runtime = "nodejs";

/** The Link widget on /connect-money calls this before it can open. */
export async function POST() {
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
  if (!plaidConfig()) {
    return NextResponse.json(
      { error: "Add PLAID_CLIENT_ID and PLAID_SECRET to the server settings first." },
      { status: 501 },
    );
  }
  try {
    const linkToken = await createLinkToken();
    return NextResponse.json({ linkToken });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
