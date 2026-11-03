import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessRevenue, syncState } from "@/lib/db/schema";
import { userTz } from "@/lib/date";

/**
 * The shared shape of every sales source (Shopify, Square, Stripe): pull the
 * last week of orders, roll them up per day, and rewrite those days. Each
 * source keeps its own rows (business_revenue is keyed on date + source), so
 * the Business revenue tile simply sums whatever is connected.
 *
 * Only daily totals are stored — never customer data.
 */

export type SalesSource = "shopify" | "square" | "stripe";
export const SALES_SOURCES: SalesSource[] = ["shopify", "square", "stripe"];

const STALE_AFTER_MS = 30 * 60 * 1000;
/** Re-pulled every time, so late edits, refunds and cancellations land on their day. */
const WINDOW_DAYS = 7;

const fmt = () => new Intl.DateTimeFormat("en-CA", { timeZone: userTz(), year: "numeric", month: "2-digit", day: "2-digit" });

export const dayOf = (at: Date) => fmt().format(at);

export type DayTotals = Map<string, { cents: number; orders: number }>;

/** A source fills `totals` with every sale since `since`; days outside the window are ignored. */
export type Fetcher = (since: Date, add: (at: Date, cents: number) => void) => Promise<void>;

async function pull(source: SalesSource, fetcher: Fetcher) {
  const days: string[] = [];
  for (let i = WINDOW_DAYS; i >= 0; i--) days.push(dayOf(new Date(Date.now() - i * 86_400_000)));
  const totals: DayTotals = new Map(days.map((d) => [d, { cents: 0, orders: 0 }]));
  // A day early, then filtered by the Toronto calendar day below.
  const since = new Date(Date.now() - (WINDOW_DAYS + 1) * 86_400_000);

  await fetcher(since, (at, cents) => {
    const t = totals.get(dayOf(at));
    if (!t) return;
    t.cents += cents;
    t.orders += 1;
  });

  // Every day in the window is written, zeros included: a day whose only
  // order was refunded has to drop back to $0, not keep its old total.
  for (const [localDate, v] of totals) {
    await db
      .insert(businessRevenue)
      .values({ localDate, revenueCents: v.cents, orderCount: v.orders, source })
      .onConflictDoUpdate({
        target: [businessRevenue.localDate, businessRevenue.source],
        set: { revenueCents: v.cents, orderCount: v.orders },
      });
  }
}

async function recordSync(source: SalesSource, error: string | null) {
  const row = { source, cursor: null, lastRunAt: new Date().toISOString(), lastError: error?.slice(0, 500) ?? null };
  await db.insert(syncState).values(row).onConflictDoUpdate({ target: syncState.source, set: row });
}

/** Forced: records the outcome and rethrows, so Refresh can report which source failed. */
export async function syncSalesNow(source: SalesSource, fetcher: Fetcher) {
  try {
    await pull(source, fetcher);
    await recordSync(source, null);
  } catch (e) {
    await recordSync(source, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** What the tile calls on render. Throttled, and never throws. */
export async function syncSalesIfStale(source: SalesSource, fetcher: Fetcher) {
  const [state] = await db.select().from(syncState).where(eq(syncState.source, source));
  if (state?.lastRunAt && Date.now() - Date.parse(state.lastRunAt) < STALE_AFTER_MS) return;
  try {
    await syncSalesNow(source, fetcher);
  } catch {
    // recordSync already stored the reason; the tile shows it.
  }
}
