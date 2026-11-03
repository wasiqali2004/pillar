/**
 * Pulls Sabr orders into the business_revenue table as daily rollups.
 *
 * Only aggregates are stored — never customer data. The dashboard reads the
 * rollup table, so the tile keeps working when Shopify is unreachable.
 *
 * Needs in .env.local:
 *   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
 *   SHOPIFY_ADMIN_TOKEN=shpat_...
 */
import { ownerDbUrl } from "./lib/owner-db.mts";
import { createClient } from "@libsql/client";

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
let TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
if (!TOKEN && DOMAIN && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
  const r = await fetch(`https://${DOMAIN}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  });
  if (!r.ok) throw new Error(`Shopify token ${r.status}: ${await r.text()}`);
  TOKEN = (await r.json()).access_token;
}
const VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-07";
const TZ = "America/Toronto";
const LOOKBACK_DAYS = Number(process.env.SHOPIFY_LOOKBACK_DAYS ?? 400);

if (!DOMAIN || !TOKEN) {
  console.error(
    "✗ Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN in .env.local first.",
  );
  process.exit(1);
}

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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

async function gql(cursor: string | null, q: string) {
  const res = await fetch(`https://${DOMAIN}/admin/api/${VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN!,
    },
    body: JSON.stringify({ query: QUERY, variables: { cursor, q } }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.orders;
}

const client = createClient({
  url: await ownerDbUrl(),
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
  .toISOString()
  .slice(0, 10);

try {
  const totals = new Map<string, { cents: number; orders: number }>();
  let cursor: string | null = null;
  let page = 0;

  do {
    const res = await gql(cursor, `created_at:>=${since}`);
    page++;
    for (const o of res.nodes) {
      if (o.test) continue;
      const day = fmt.format(new Date(o.createdAt));
      const cents = Math.round(
        Number(o.currentTotalPriceSet.shopMoney.amount) * 100,
      );
      const cur = totals.get(day) ?? { cents: 0, orders: 0 };
      totals.set(day, { cents: cur.cents + cents, orders: cur.orders + 1 });
    }
    cursor = res.pageInfo.hasNextPage ? res.pageInfo.endCursor : null;
    process.stdout.write(`\r· page ${page}, ${totals.size} days`);
  } while (cursor);

  console.log("");

  for (const [day, v] of totals) {
    await client.execute({
      sql: `INSERT INTO business_revenue (local_date, revenue_cents, order_count, source)
            VALUES (?, ?, ?, 'shopify')
            ON CONFLICT(local_date, source)
            DO UPDATE SET revenue_cents = excluded.revenue_cents,
                          order_count   = excluded.order_count`,
      args: [day, v.cents, v.orders],
    });
  }

  await client.execute({
    sql: `INSERT INTO sync_state (source, cursor, last_run_at, last_error)
          VALUES ('shopify', NULL, ?, NULL)
          ON CONFLICT(source) DO UPDATE SET last_run_at = excluded.last_run_at,
                                            last_error  = NULL`,
    args: [new Date().toISOString()],
  });

  const total = [...totals.values()].reduce((n, v) => n + v.cents, 0);
  console.log(
    `✓ synced ${totals.size} days, ${[...totals.values()].reduce((n, v) => n + v.orders, 0)} orders, $${(total / 100).toLocaleString("en-CA")}`,
  );
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  await client.execute({
    sql: `INSERT INTO sync_state (source, cursor, last_run_at, last_error)
          VALUES ('shopify', NULL, ?, ?)
          ON CONFLICT(source) DO UPDATE SET last_run_at = excluded.last_run_at,
                                            last_error  = excluded.last_error`,
    args: [new Date().toISOString(), msg.slice(0, 500)],
  });
  console.error("✗ sync failed:", msg.slice(0, 300));
  client.close();
  process.exit(1);
}

client.close();
