import "server-only";
import { getCredentials, type Credentials } from "@/lib/connections/vault";
import { syncSalesIfStale, syncSalesNow, type Fetcher } from "./sales";

/**
 * Shopify → daily revenue. The user connects their own store on the
 * Connections page; the old SHOPIFY_* variables in .env.local still work as a
 * fallback for a self-hosted install.
 *
 * Two kinds of credential: a Dev Dashboard app gives a client id + secret,
 * traded here for a token that lasts 24h; an older admin-made custom app
 * gives a permanent Admin API token (shpat_…).
 */

type Auth = Credentials["shopify"];

const VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-07";

const QUERY = `
query Orders($cursor: String, $q: String!) {
  orders(first: 250, after: $cursor, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      createdAt
      test
      currentTotalPriceSet { shopMoney { amount } }
    }
  }
}`;

type OrdersPage = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: { createdAt: string; test: boolean; currentTotalPriceSet: { shopMoney: { amount: string } } }[];
};

/** "my-store", "my-store.myshopify.com" or a pasted admin URL all become the .myshopify.com host. */
export function normalizeShopDomain(input: string): string {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  return host.includes(".") ? host : `${host}.myshopify.com`;
}

/**
 * Only ever the signed-in user's own saved connection. There is deliberately no
 * server-wide fallback key: with more than one user it would show one person's
 * store revenue to everyone.
 */
async function auth(): Promise<Auth | null> {
  return getCredentials("shopify");
}

export async function shopifyConfigured(): Promise<boolean> {
  return (await auth()) !== null;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function accessToken(a: Auth): Promise<string> {
  if (a.token) return a.token;
  const hit = tokenCache.get(a.domain);
  if (hit && Date.now() < hit.expiresAt - 5 * 60_000) return hit.token;
  const res = await fetch(`https://${a.domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: a.clientId ?? "",
      client_secret: a.clientSecret ?? "",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Shopify rejected the app's client ID or secret (${res.status})`);
  const j = await res.json();
  tokenCache.set(a.domain, { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 86_400) * 1000 });
  return j.access_token;
}

async function graphql<T>(a: Auth, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://${a.domain}/admin/api/${VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await accessToken(a) },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new Error("Shopify rejected the access token. Check it has the read_orders scope.");
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors).slice(0, 300));
  return json.data as T;
}

/** Checks a store and credentials work before they're saved; returns the store's name. */
export async function verifyShopify(a: Auth): Promise<string> {
  const d = await graphql<{ shop: { name: string } }>(a, "{ shop { name } }");
  return d.shop.name;
}

const fetcher: Fetcher = async (since, add) => {
  const a = await auth();
  if (!a) return;
  const q = `created_at:>=${since.toISOString().slice(0, 10)}`;
  let cursor: string | null = null;
  do {
    const d: { orders: OrdersPage } = await graphql(a, QUERY, { cursor, q });
    for (const o of d.orders.nodes) {
      if (o.test) continue;
      add(new Date(o.createdAt), Math.round(Number(o.currentTotalPriceSet.shopMoney.amount) * 100));
    }
    cursor = d.orders.pageInfo.hasNextPage ? d.orders.pageInfo.endCursor : null;
  } while (cursor);
};

export async function syncShopifyNow() {
  await syncSalesNow("shopify", fetcher);
}

export async function syncShopifyIfStale() {
  if (await shopifyConfigured()) await syncSalesIfStale("shopify", fetcher);
}
