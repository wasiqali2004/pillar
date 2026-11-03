import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bodyMetrics, businessRevenue, moneyEntries, syncState, workouts } from "@/lib/db/schema";
import { localDate, daysBetween } from "@/lib/date";
import { getLayout } from "@/lib/dashboard/prefs";
import { healthStatus } from "@/lib/health/google-health";
import { moneyLinkStatus } from "@/lib/money/plaid";
import { hevyConfigured } from "@/lib/training/hevy";
import { listConnections } from "./vault";
import type { SourceHealth } from "./freshness-types";

export type { How, SourceHealth } from "./freshness-types";
export { isStale } from "./freshness-types";

/**
 * "Is everything still up to date?" answered per source, honestly.
 *
 * The distinction that matters, and that the Connect page never used to make:
 *
 *   auto    the app pulls it on its own. Left alone, it stays current.
 *   manual  there is no API to pull from. Amex and Wealthsimple publish none,
 *           so the only way their numbers move is a statement upload. Left
 *           alone it silently goes stale, which is worse than empty — a month
 *           of missing spend reads as a cheap month.
 *   off     not connected, so there is nothing to be stale.
 *
 * Staleness is measured against the newest *data* date, not the last sync:
 * a Plaid pull that succeeds every hour and returns nothing still means the
 * spending figures are a week old.
 */

async function maxDate(
  table: typeof bodyMetrics | typeof workouts | typeof businessRevenue,
  col: "localDate",
): Promise<string | null> {
  const [r] = await db.select({ v: sql<string | null>`max(${table[col]})` }).from(table);
  return r?.v ?? null;
}

export async function sourceHealth(): Promise<SourceHealth[]> {
  const today = localDate();
  const on = new Set(((await getLayout()) ?? []).map((i) => i.id));

  const [states, health, bank, hevy, saved] = await Promise.all([
    db.select().from(syncState),
    healthStatus(),
    moneyLinkStatus(),
    hevyConfigured(),
    listConnections(),
  ]);
  const stateOf = (id: string) => states.find((s) => s.source === id) ?? null;
  const savedIds = new Set(saved.map((c) => c.provider));
  const age = (d: string | null) => (d ? Math.max(0, daysBetween(d, today)) : null);

  const out: SourceHealth[] = [];

  /* ── body: watch or upload ── */
  if (on.has("body")) {
    const covers = await maxDate(bodyMetrics, "localDate");
    const st = stateOf("google_health");
    out.push(
      health.connected
        ? {
            id: "google_health",
            label: "Steps, calories & sleep",
            how: "auto",
            coversTo: covers,
            staleDays: age(covers),
            lastRunAt: st?.lastRunAt ?? null,
            error: health.expired ? null : (st?.lastError ?? null),
            note: health.expired ? "Google ended this connection. Reconnect to keep it updating." : "Pulled from Google Health about every 10 minutes.",
            action: health.expired ? { label: "Reconnect", href: "/api/auth/google-health" } : null,
          }
        : {
            id: "google_health",
            label: "Steps, calories & sleep",
            how: covers ? "manual" : "off",
            coversTo: covers,
            staleDays: age(covers),
            lastRunAt: null,
            error: null,
            note: covers
              ? "Coming from uploaded files. Connect a watch and this keeps itself current."
              : "Nothing connected yet.",
            action: health.configured ? { label: "Connect your watch", href: "/api/auth/google-health" } : null,
          },
    );
  }

  /* ── training ── */
  if (on.has("training") || on.has("body")) {
    const covers = await maxDate(workouts, "localDate");
    const st = stateOf("hevy");
    const connected = hevy || savedIds.has("hevy");
    out.push({
      id: "hevy",
      label: "Workouts",
      how: connected ? "auto" : covers ? "manual" : "off",
      coversTo: covers,
      staleDays: age(covers),
      lastRunAt: st?.lastRunAt ?? null,
      error: st?.lastError ?? null,
      note: connected ? "Pulled from Hevy on every refresh." : "Logged by hand from Training.",
      action: connected ? null : { label: "Connect Hevy", href: "/app/connect" },
    });
  }

  /* ── money: the part with no API ── */
  if (on.has("money")) {
    if (bank.accounts.length > 0) {
      const st = stateOf("plaid");
      const [r] = await db
        .select({ v: sql<string | null>`max(${moneyEntries.occurredOn})` })
        .from(moneyEntries)
        .where(eq(moneyEntries.source, "plaid"));
      out.push({
        id: "plaid",
        label: `Bank sync (${bank.accounts.length} linked)`,
        how: "auto",
        coversTo: r?.v ?? null,
        staleDays: age(r?.v ?? null),
        lastRunAt: st?.lastRunAt ?? null,
        error: st?.lastError ?? null,
        note: "Pulled automatically about once an hour.",
        action: null,
      });
    }

    // One row per card or account he has ever uploaded, because each goes
    // stale on its own schedule — Amex in one tab, Wealthsimple in another.
    const accounts = await db
      .select({
        account: moneyEntries.account,
        covers: sql<string>`max(${moneyEntries.occurredOn})`,
      })
      .from(moneyEntries)
      .where(sql`${moneyEntries.source} = 'csv' and ${moneyEntries.account} is not null`)
      .groupBy(moneyEntries.account)
      .orderBy(desc(sql`max(${moneyEntries.occurredOn})`));

    for (const a of accounts) {
      out.push({
        id: `csv:${a.account}`,
        label: a.account ?? "Statement",
        how: "manual",
        coversTo: a.covers,
        staleDays: age(a.covers),
        lastRunAt: null,
        error: null,
        note: "No API exists for this one, so it only moves when you upload a statement.",
        action: { label: "Upload newer statement", href: "/app/connect" },
      });
    }

    if (bank.accounts.length === 0 && accounts.length === 0) {
      out.push({
        id: "money:none",
        label: "Spending",
        how: "off",
        coversTo: null,
        staleDays: null,
        lastRunAt: null,
        error: null,
        note: "Nothing added yet.",
        action: { label: "Upload a statement", href: "/app/connect" },
      });
    }
  }

  /* ── business ── */
  if (on.has("business")) {
    const covers = await maxDate(businessRevenue, "localDate");
    const sales = (["shopify", "square", "stripe"] as const).filter((p) => savedIds.has(p));
    const st = sales.map((p) => stateOf(p)).find((s) => s?.lastRunAt) ?? null;
    out.push({
      id: "sales",
      label: sales.length ? `Store sales (${sales.join(", ")})` : "Store sales",
      how: sales.length ? "auto" : "off",
      coversTo: covers,
      staleDays: age(covers),
      lastRunAt: st?.lastRunAt ?? null,
      error: st?.lastError ?? null,
      note: sales.length ? "Pulled about every 30 minutes." : "Connect Shopify, Square or Stripe to fill this in.",
      action: sales.length ? null : { label: "Connect a store", href: "/app/connect" },
    });
  }

  return out;
}
