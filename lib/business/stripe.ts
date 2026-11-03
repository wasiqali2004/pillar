import "server-only";
import { getCredentials } from "@/lib/connections/vault";
import { syncSalesIfStale, syncSalesNow, type Fetcher } from "./sales";

/**
 * Stripe → daily revenue: for a website that takes payments through Stripe
 * (most custom sites, and many WooCommerce, Wix and Squarespace stores).
 * Succeeded charges net of refunds. The user pastes a restricted key that
 * can only read charges.
 */

type Charge = { id: string; created: number; amount: number; amount_refunded: number; paid: boolean; status: string };

async function stripe<T>(key: string, path: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (res.status === 401) throw new Error("Stripe rejected the key. Check you copied all of it.");
  if (res.status === 403) throw new Error("That key can't read charges. Give it Charges: Read.");
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export async function stripeConfigured(): Promise<boolean> {
  return (await getCredentials("stripe")) !== null;
}

/** Checks the key can read charges before it's saved. */
export async function verifyStripe(key: string): Promise<string> {
  await stripe(key, "/charges?limit=1");
  return key.includes("_test_") ? "Stripe (test mode)" : "Stripe";
}

const fetcher: Fetcher = async (since, add) => {
  const creds = await getCredentials("stripe");
  if (!creds) return;
  let after: string | undefined;
  for (;;) {
    const qs = new URLSearchParams({ "created[gte]": String(Math.floor(since.getTime() / 1000)), limit: "100" });
    if (after) qs.set("starting_after", after);
    const r = await stripe<{ data: Charge[]; has_more: boolean }>(creds.key, `/charges?${qs}`);
    for (const c of r.data) {
      if (!c.paid || c.status !== "succeeded") continue;
      add(new Date(c.created * 1000), c.amount - c.amount_refunded);
    }
    if (!r.has_more || r.data.length === 0) break;
    after = r.data[r.data.length - 1].id;
  }
};

export async function syncStripeNow() {
  await syncSalesNow("stripe", fetcher);
}

export async function syncStripeIfStale() {
  if (await stripeConfigured()) await syncSalesIfStale("stripe", fetcher);
}
