import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { plaidItems, auditLog } from "@/lib/db/schema";
import { openSecret, sealSecret } from "@/lib/connections/vault";
import { MAX_LINKED_BANKS } from "@/lib/dashboard/catalog";

/**
 * Shared Plaid plumbing — config, the raw request helper, and linking a new
 * account. lib/money/plaid.ts (transactions) and
 * lib/portfolio/plaid-investments.ts (holdings) both build on this rather
 * than each keeping their own copy, since it's the same bank connection
 * either way: one Link covers both products where an institution has both.
 */

export type Config = { clientId: string; secret: string; baseUrl: string };

/** Null rather than throwing, so an unconfigured app still renders its tiles. */
export function plaidConfig(): Config | null {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
  if (!clientId || !secret) return null;
  // "production" also covers Plaid's free Trial plan — Trial and paid plans
  // both run through the production host, the cost only differs by usage.
  const baseUrl =
    env === "production"
      ? "https://production.plaid.com"
      : "https://sandbox.plaid.com";
  return { clientId, secret, baseUrl };
}

export async function plaidPost<T>(
  cfg: Config,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: cfg.clientId,
      secret: cfg.secret,
      ...body,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    // error_code is Plaid's machine-readable id (ITEM_LOGIN_REQUIRED, etc.);
    // error_message can echo request details, so only the code is surfaced.
    throw new Error(
      `Plaid ${path} failed: ${json.error_code ?? json.error_type ?? res.status}`,
    );
  }
  return json;
}

/* ── linking a new account ─────────────────────────────────────
   One-time per bank. The user logs in on Plaid's own hosted screen
   (app/connect-money) — this app never sees the bank password. */

/**
 * A short-lived token the Link widget needs to open.
 *
 * Transactions only. Plaid's Investments product is billed on its own, and
 * holdings are entered by hand, so it's deliberately not requested here.
 */
export async function createLinkToken(): Promise<string> {
  const cfg = plaidConfig();
  if (!cfg) throw new Error("Plaid credentials are not configured.");

  const json = await plaidPost<{ link_token: string }>(
    cfg,
    "/link/token/create",
    {
      // No real end-user accounts here; one person per install.
      user: { client_user_id: "rafiq" },
      client_name: "Pillar",
      products: ["transactions"],
      country_codes: ["CA"],
      language: "en",
    },
  );
  return json.link_token;
}

/** Exchanges Link's one-time public_token for a durable access_token, and stores it. */
export async function linkAccount(
  publicToken: string,
  institutionName: string | null,
): Promise<{ itemId: string }> {
  const cfg = plaidConfig();
  if (!cfg) throw new Error("Plaid credentials are not configured.");

  const json = await plaidPost<{ access_token: string; item_id: string }>(
    cfg,
    "/item/public_token/exchange",
    { public_token: publicToken },
  );

  await db
    .insert(plaidItems)
    .values({
      itemId: json.item_id,
      accessToken: sealSecret(json.access_token),
      institutionName,
      cursor: null,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: plaidItems.itemId,
      set: { accessToken: sealSecret(json.access_token), institutionName },
    });

  await db.insert(auditLog).values({
    actor: "user",
    action: "plaid.link",
    tableName: "plaid_items",
    payload: { itemId: json.item_id, institutionName },
  });

  return { itemId: json.item_id };
}

export async function unlinkAccount(itemId: string) {
  const [row] = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.itemId, itemId));
  if (!row) return;

  const cfg = plaidConfig();
  // Best-effort: revoke at Plaid too, but a dead item shouldn't block removing
  // it locally — an already-expired token would otherwise make this stick.
  // Cascades to plaid_investment_holdings; money_entries rows stay (they're
  // real past transactions, not live state tied to the connection).
  if (cfg) {
    try {
      await plaidPost(cfg, "/item/remove", { access_token: openSecret(row.accessToken) });
    } catch {}
  }

  await db.delete(plaidItems).where(eq(plaidItems.itemId, itemId));
  await db.insert(auditLog).values({
    actor: "user",
    action: "plaid.unlink",
    tableName: "plaid_items",
    payload: { itemId },
  });
}

/** True once a user has as many linked banks as their plan allows. */
export async function bankLimitReached(): Promise<boolean> {
  return (await linkedAccounts()).length >= MAX_LINKED_BANKS;
}

export async function linkedAccounts() {
  return db.select().from(plaidItems);
}
