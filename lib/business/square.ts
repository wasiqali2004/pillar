import "server-only";
import { getCredentials } from "@/lib/connections/vault";
import { syncSalesIfStale, syncSalesNow, type Fetcher } from "./sales";

/**
 * Square → daily revenue, from completed payments net of refunds. The user
 * pastes a production access token from their Square Developer account.
 */

const BASE = "https://connect.squareup.com/v2";

type Payment = {
  created_at: string;
  status: string;
  amount_money?: { amount: number };
  refunded_money?: { amount: number };
};

async function square<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Square rejected the access token. Make sure it's the Production one.");
  if (!res.ok) throw new Error(`Square ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export async function squareConfigured(): Promise<boolean> {
  return (await getCredentials("square")) !== null;
}

/** Checks the token before it's saved; returns the business's first location name. */
export async function verifySquare(token: string): Promise<string> {
  const r = await square<{ locations?: { business_name?: string; name?: string }[] }>(token, "/locations");
  const loc = r.locations?.[0];
  return loc?.business_name || loc?.name || "Square";
}

const fetcher: Fetcher = async (since, add) => {
  const creds = await getCredentials("square");
  if (!creds) return;
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ begin_time: since.toISOString(), sort_order: "ASC", limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const r = await square<{ payments?: Payment[]; cursor?: string }>(creds.token, `/payments?${qs}`);
    for (const p of r.payments ?? []) {
      if (p.status !== "COMPLETED") continue;
      add(new Date(p.created_at), (p.amount_money?.amount ?? 0) - (p.refunded_money?.amount ?? 0));
    }
    cursor = r.cursor;
  } while (cursor);
};

export async function syncSquareNow() {
  await syncSalesNow("square", fetcher);
}

export async function syncSquareIfStale() {
  if (await squareConfigured()) await syncSalesIfStale("square", fetcher);
}
