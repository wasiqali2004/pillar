import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { openSecret } from "@/lib/connections/vault";
import { plaidItems, moneyEntries, syncState, auditLog } from "@/lib/db/schema";
import { plaidConfig, plaidPost } from "@/lib/plaid/client";

/**
 * Plaid transactions — the only realistic way to pull Amex/TD/Wealthsimple/EQ
 * Bank spending automatically, since none of them publish a personal API.
 * Plaid's free Trial plan covers up to 10 connected accounts with real data,
 * which is more than the 4 this app needs — see the .env.example note before
 * you sign up. Linking and holdings live in lib/plaid/client.ts and
 * lib/portfolio/plaid-investments.ts — this file is transactions only.
 *
 * /transactions/sync (not /transactions/get) is deliberate: it's cursor-based
 * and hands back only what changed since the last call — added, modified and
 * removed — instead of re-fetching a date range and diffing it by hand.
 */

const SOURCE = "plaid";

export {
  createLinkToken,
  linkAccount,
  unlinkAccount,
  linkedAccounts,
  bankLimitReached,
  plaidConfig,
} from "@/lib/plaid/client";

/* ── reading transactions ──────────────────────────────────────── */

type PlaidTransaction = {
  transaction_id: string;
  /** Plaid's sign convention: positive = money OUT, negative = money IN.
      Consistent across every account type, unlike the CSV exports. */
  amount: number;
  iso_currency_code: string | null;
  date: string;
  merchant_name: string | null;
  name: string;
  pending: boolean;
  personal_finance_category: { primary: string } | null;
};

type SyncPage = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  next_cursor: string;
  has_more: boolean;
  /** NOT_READY right after linking, while Plaid is still pulling history. */
  transactions_update_status?: string;
};

/** "GENERAL_MERCHANDISE" → "General merchandise" */
function humanizeCategory(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Deterministic id for the unique index money_entries already has — a
    transaction Plaid has already deduplicated needs no hashing of our own. */
function fingerprint(transactionId: string): string {
  return `plaid:${createHash("sha1").update(transactionId).digest("hex").slice(0, 24)}`;
}

async function syncOneItem(item: {
  itemId: string;
  accessToken: string;
  institutionName: string | null;
  cursor: string | null;
}) {
  const cfg = plaidConfig();
  if (!cfg) throw new Error("Plaid credentials are not configured.");

  let cursor = item.cursor ?? undefined;
  let written = 0;
  let ready = true;

  // has_more pages through everything new since the last stored cursor —
  // on the very first sync (cursor undefined) that means the account's
  // full history, per Plaid's default lookback.
  let hasMore = true;
  while (hasMore) {
    const page = await plaidPost<SyncPage>(cfg, "/transactions/sync", {
      access_token: openSecret(item.accessToken),
      cursor,
    });

    for (const t of [...page.added, ...page.modified]) {
      if (t.pending) continue; // Pending amounts can still change or vanish.
      const direction = t.amount >= 0 ? "out" : "in";
      await db
        .insert(moneyEntries)
        .values({
          amountCents: Math.round(Math.abs(t.amount) * 100),
          direction,
          category: humanizeCategory(t.personal_finance_category?.primary ?? null),
          occurredOn: t.date,
          note: t.merchant_name ?? t.name,
          account: item.institutionName,
          source: "plaid" as const,
          importFingerprint: fingerprint(t.transaction_id),
        })
        .onConflictDoUpdate({
          target: moneyEntries.importFingerprint,
          set: {
            amountCents: Math.round(Math.abs(t.amount) * 100),
            direction,
            category: humanizeCategory(t.personal_finance_category?.primary ?? null),
            note: t.merchant_name ?? t.name,
          },
        });
      written++;
    }

    for (const t of page.removed) {
      await db
        .delete(moneyEntries)
        .where(eq(moneyEntries.importFingerprint, fingerprint(t.transaction_id)));
    }

    cursor = page.next_cursor;
    hasMore = page.has_more;
    ready = page.transactions_update_status !== "NOT_READY";
  }

  await db
    .update(plaidItems)
    .set({ cursor, updatedAt: new Date().toISOString() })
    .where(eq(plaidItems.itemId, item.itemId));

  return { written, ready };
}

export type SyncResult = { accounts: number; transactions: number };

export async function syncMoney(): Promise<SyncResult> {
  const items = await db.select().from(plaidItems);
  if (items.length === 0) return { accounts: 0, transactions: 0 };

  try {
    let transactions = 0;
    let allReady = true;
    for (const item of items) {
      const r = await syncOneItem(item);
      transactions += r.written;
      allReady &&= r.ready;
    }

    // A just-linked bank returns nothing until Plaid finishes its first pull.
    // Counting that empty run as fresh would leave the tile blank for an hour.
    await recordSync(null, { retrySoon: !allReady });
    if (transactions > 0) {
      await db.insert(auditLog).values({
        actor: "rafiq",
        action: "money.sync",
        tableName: "money_entries",
        payload: { accounts: items.length, transactions, source: SOURCE },
      });
    }
    return { accounts: items.length, transactions };
  } catch (e) {
    await recordSync(e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** Don't re-hit Plaid on every render — an hour keeps "daily" comfortably
    fresh without burning API calls on repeated dashboard loads. */
const STALE_AFTER_MS = 60 * 60 * 1000;

/** How soon to try again while a new link's history is still NOT_READY. */
const RETRY_SOON_MS = 2 * 60 * 1000;

async function recordSync(
  error: string | null,
  { retrySoon = false }: { retrySoon?: boolean } = {},
) {
  // Backdating lastRunAt makes the throttle expire in RETRY_SOON_MS instead
  // of a full STALE_AFTER_MS, without a second column to track it.
  const at = retrySoon
    ? Date.now() - STALE_AFTER_MS + RETRY_SOON_MS
    : Date.now();
  const row = {
    source: SOURCE,
    cursor: null,
    lastRunAt: new Date(at).toISOString(),
    lastError: error?.slice(0, 500) ?? null,
  };
  await db
    .insert(syncState)
    .values(row)
    .onConflictDoUpdate({ target: syncState.source, set: row });
}

/** What the Money tile calls on render. Throttled, and never throws — a dead
    feed shows the last-synced numbers rather than an error page. */
export async function syncMoneyIfStale(): Promise<void> {
  if (!plaidConfig()) return;

  const [state] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.source, SOURCE));

  if (
    state?.lastRunAt &&
    Date.now() - Date.parse(state.lastRunAt) < STALE_AFTER_MS
  ) {
    return;
  }

  try {
    await syncMoney();
  } catch {
    // recordSync already stored the reason; moneyLinkStatus() surfaces it.
  }
}

export type MoneyLinkStatus = {
  configured: boolean;
  accounts: { itemId: string; institutionName: string | null }[];
  lastRunAt: string | null;
  lastError: string | null;
};

export async function moneyLinkStatus(): Promise<MoneyLinkStatus> {
  const [items, [state]] = await Promise.all([
    db.select().from(plaidItems),
    db.select().from(syncState).where(eq(syncState.source, SOURCE)),
  ]);

  return {
    configured: plaidConfig() != null,
    accounts: items.map((i) => ({
      itemId: i.itemId,
      institutionName: i.institutionName,
    })),
    lastRunAt: state?.lastRunAt ?? null,
    lastError: state?.lastError ?? null,
  };
}
