import { getSessionUser } from "@/lib/auth/session";
import { currentClient } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Internal bookkeeping, and tables whose whole content is connection secrets. */
const SKIP = new Set(["__drizzle_migrations", "sqlite_sequence", "oauth_tokens", "plaid_items"]);

/**
 * Everything Pillar holds about the signed-in user, as one JSON file. Secrets
 * are left out: they aren't the user's data so much as keys to other services,
 * and a downloaded file is easy to leave lying around.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  const client = await currentClient();
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");

  const data: Record<string, unknown[]> = {};
  for (const row of tables.rows) {
    const name = String(row.name);
    if (SKIP.has(name) || !/^[a-z_]+$/.test(name)) continue;
    const r = await client.execute(`SELECT * FROM "${name}"`);
    const rows = r.rows.map((x) => Object.fromEntries(r.columns.map((c) => [c, typeof x[c] === "bigint" ? Number(x[c]) : x[c]])));
    data[name] = name === "app_settings" ? rows.filter((x) => !/^(connection:|push\.subscriptions)/.test(String(x.key))) : rows;
  }

  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      account: { email: user.email, name: user.name, timezone: user.timezone, createdAt: user.createdAt },
      data,
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="pillar-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
