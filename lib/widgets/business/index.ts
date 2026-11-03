import "server-only";
import { gte, sql, desc } from "drizzle-orm";
import { defineWidget } from "../types";
import { BusinessTile } from "./BusinessTile";
import { db } from "@/lib/db";
import { businessRevenue, syncState } from "@/lib/db/schema";
import { syncShopifyIfStale, shopifyConfigured } from "@/lib/business/shopify";
import { syncSquareIfStale, squareConfigured } from "@/lib/business/square";
import { syncStripeIfStale, stripeConfigured } from "@/lib/business/stripe";
import { SALES_SOURCES } from "@/lib/business/sales";
import {
  localDate,
  startOfWeek,
  startOfMonth,
  startOfYear,
  shiftDate,
  recentDates,
  dayOfMonth,
  daysInMonth,
} from "@/lib/date";

export type BusinessData = {
  todayCents: number;
  weekCents: number;
  monthCents: number;
  yearCents: number;
  ordersMonth: number;
  /** Straight-line projection from the month's run rate so far. */
  projectedMonthCents: number;
  /** Same span last month, for a like-for-like comparison. */
  lastMonthToDateCents: number;
  daily14: (number | null)[];
  connected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  /** True once any sales app is connected; the numbers then refresh on their own. */
  autoSync: boolean;
};

async function sumSince(since: string) {
  const [r] = await db
    .select({
      cents: sql<number>`coalesce(sum(${businessRevenue.revenueCents}), 0)`,
      orders: sql<number>`coalesce(sum(${businessRevenue.orderCount}), 0)`,
    })
    .from(businessRevenue)
    .where(gte(businessRevenue.localDate, since));
  return { cents: Number(r?.cents ?? 0), orders: Number(r?.orders ?? 0) };
}

export async function loadBusiness(): Promise<BusinessData> {
  // Re-pulls the last week from each connected sales app if its last pull is
  // over 30 minutes old. Throttled and non-throwing, so the tile renders either way.
  const [, , , shop, sq, st] = await Promise.all([
    syncShopifyIfStale(),
    syncSquareIfStale(),
    syncStripeIfStale(),
    shopifyConfigured(),
    squareConfigured(),
    stripeConfigured(),
  ]);
  const anyConfigured = shop || sq || st;

  const today = localDate();

  const [week, month, year, rows, sync, anyRow] = await Promise.all([
    sumSince(startOfWeek(today)),
    sumSince(startOfMonth(today)),
    sumSince(startOfYear(today)),
    db
      .select()
      .from(businessRevenue)
      .where(gte(businessRevenue.localDate, shiftDate(today, -14))),
    db.select().from(syncState),
    db.select().from(businessRevenue).orderBy(desc(businessRevenue.localDate)).limit(1),
  ]);

  const byDate = new Map(rows.map((r) => [r.localDate, r.revenueCents]));
  const daily14 = recentDates(14, today)
    .reverse()
    .map((d) => byDate.get(d) ?? null);

  // Same number of elapsed days, one month back.
  const elapsed = dayOfMonth(today);
  const lastMonthStart = shiftDate(startOfMonth(today), -1).slice(0, 7) + "-01";
  const lastMonthCutoff = `${lastMonthStart.slice(0, 7)}-${String(elapsed).padStart(2, "0")}`;
  const [lm] = await db
    .select({ cents: sql<number>`coalesce(sum(${businessRevenue.revenueCents}), 0)` })
    .from(businessRevenue)
    .where(
      sql`${businessRevenue.localDate} >= ${lastMonthStart} AND ${businessRevenue.localDate} <= ${lastMonthCutoff}`,
    );

  // The most recent pull across every sales source, and any that failed.
  const sales = sync
    .filter((s) => (SALES_SOURCES as string[]).includes(s.source) && s.lastRunAt)
    .sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""));
  const failed = sales.find((s) => s.lastError);

  return {
    // Reuses the 14-day window already fetched above; a day with no orders is
    // a real zero, not missing data, so it must not fall back to null here.
    todayCents: byDate.get(today) ?? 0,
    weekCents: week.cents,
    monthCents: month.cents,
    yearCents: year.cents,
    ordersMonth: month.orders,
    projectedMonthCents:
      elapsed > 0 ? Math.round((month.cents / elapsed) * daysInMonth(today)) : 0,
    lastMonthToDateCents: Number(lm?.cents ?? 0),
    daily14,
    connected: anyRow.length > 0 || anyConfigured,
    lastSyncAt: sales[0]?.lastRunAt ?? null,
    lastError: failed?.lastError ?? null,
    autoSync: anyConfigured,
  };
}

export async function businessSummary() {
  const d = await loadBusiness();
  return {
    revenue_this_week_cents: d.weekCents,
    revenue_this_month_cents: d.monthCents,
    revenue_this_year_cents: d.yearCents,
    orders_this_month: d.ordersMonth,
    projected_month_cents: d.projectedMonthCents,
    same_period_last_month_cents: d.lastMonthToDateCents,
    connected: d.connected,
    last_sync: d.lastSyncAt,
  };
}

export const businessWidget = defineWidget<BusinessData>({
  id: "business",
  title: "Business revenue",
  size: "sm",
  refresh: "live",
  load: loadBusiness,
  Tile: BusinessTile,
  tools: [
    {
      name: "get_business_revenue",
      description:
        "Business revenue (Shopify, Square and Stripe, whichever are connected) this week, month and year, order count, month-end projection, and the same period last month. Amounts in cents.",
      input_schema: { type: "object", properties: {} },
      handler: businessSummary,
    },
  ],
});
