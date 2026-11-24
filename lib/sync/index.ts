import "server-only";
import { healthStatus, syncHealth, syncHealthIfStale } from "@/lib/health/google-health";
import { shopifyConfigured, syncShopifyIfStale, syncShopifyNow } from "@/lib/business/shopify";
import { squareConfigured, syncSquareIfStale, syncSquareNow } from "@/lib/business/square";
import { stripeConfigured, syncStripeIfStale, syncStripeNow } from "@/lib/business/stripe";
import { moneyLinkStatus, syncMoney, syncMoneyIfStale } from "@/lib/money/plaid";
import { expireQuoteCache } from "@/lib/portfolio/market";
import { hevyConfigured, syncHevy, syncHevyIfStale } from "@/lib/training/hevy";
import { getLayout } from "@/lib/dashboard/prefs";
import type { WidgetId } from "@/lib/dashboard/catalog";

/**
 * One place that knows how to bring every external source up to date.
 *
 * The tiles each sync themselves on render, but throttled — 10 minutes for
 * health, 30 for Shopify, an hour for Plaid, 15 for quotes. That is right for
 * a dashboard left open and wrong for someone standing there wanting to see
 * a number move now, which is what this is for: it ignores every throttle.
 *
 * Sources run in parallel and are isolated from each other. A Plaid outage
 * must not stop Shopify from updating, so each one's failure is caught and
 * reported as its own row rather than thrown. Each underlying sync already
 * records its own error to sync_state, so the tiles keep their own notes.
 *
 * "skipped" is not a failure — it means the source isn't connected, which is
 * the normal state for anything that hasn't been set up yet.
 */

export type SourceStatus = "ok" | "skipped" | "error";

export type SourceResult = {
  id: string;
  label: string;
  status: SourceStatus;
  /** One short line for the UI: what happened, or why it didn't. */
  detail: string;
};

export type RefreshReport = {
  at: string;
  ms: number;
  sources: SourceResult[];
  /** Counts for the summary line, so the client doesn't recompute them. */
  ok: number;
  failed: number;
  skipped: number;
};

const message = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).slice(0, 160);

/** Runs one source, turning any throw into an `error` row. */
async function run(
  id: string,
  label: string,
  fn: () => Promise<SourceResult>,
): Promise<SourceResult> {
  try {
    return await fn();
  } catch (e) {
    return { id, label, status: "error", detail: message(e) };
  }
}

async function refreshHealth(): Promise<SourceResult> {
  const id = "google_health";
  const label = "Sleep & steps";
  const s = await healthStatus();
  if (!s.configured) {
    return { id, label, status: "skipped", detail: "Not set up" };
  }
  if (!s.connected) {
    return { id, label, status: "skipped", detail: "Not connected" };
  }
  const r = await syncHealth(30);
  return {
    id,
    label,
    status: "ok",
    detail: `${r.nights} nights · ${r.activityDays} days`,
  };
}

const salesSource =
  (id: string, label: string, configured: () => Promise<boolean>, sync: () => Promise<void>) =>
  async (): Promise<SourceResult> => {
    if (!(await configured())) return { id, label, status: "skipped", detail: "Not connected" };
    await sync();
    return { id, label, status: "ok", detail: "Sales updated" };
  };

const refreshShopify = salesSource("shopify", "Shopify sales", shopifyConfigured, syncShopifyNow);
const refreshSquare = salesSource("square", "Square sales", squareConfigured, syncSquareNow);
const refreshStripe = salesSource("stripe", "Stripe sales", stripeConfigured, syncStripeNow);

async function refreshMoney(): Promise<SourceResult> {
  const id = "plaid";
  const label = "Spending";
  const s = await moneyLinkStatus();
  if (s.accounts.length === 0) {
    return { id, label, status: "skipped", detail: "No accounts linked" };
  }
  const r = await syncMoney();
  return {
    id,
    label,
    status: "ok",
    detail:
      r.transactions > 0
        ? `${r.transactions} new from ${r.accounts} account${r.accounts === 1 ? "" : "s"}`
        : `Up to date · ${r.accounts} account${r.accounts === 1 ? "" : "s"}`,
  };
}

async function refreshWorkouts(): Promise<SourceResult> {
  const id = "hevy";
  const label = "Workouts";
  if (!(await hevyConfigured())) {
    return { id, label, status: "skipped", detail: "Hevy not connected" };
  }
  const r = await syncHevy();
  return {
    id,
    label,
    status: "ok",
    detail: r.changed > 0 ? `${r.changed} updated` : "Up to date",
  };
}

/**
 * Prices are a cache expiry rather than a fetch: the quotes are pulled by
 * loadPortfolio during the re-render that follows, where the results can
 * actually reach the tile. Doing it here would fetch them twice.
 */
async function refreshPrices(): Promise<SourceResult> {
  expireQuoteCache();
  return {
    id: "market",
    label: "Market prices",
    status: "ok",
    detail: "Prices refreshed",
  };
}

/**
 * The no-tab-open version, run by lib/sync/scheduler.ts for one user at a time.
 * Uses each source's own throttle rather than forcing it, and only touches what
 * that user has on their dashboard.
 */
export async function backgroundSync(): Promise<void> {
  const layout = await getLayout();
  if (!layout) return;
  const on = new Set(layout.map((i) => i.id));
  const jobs: Promise<unknown>[] = [];
  if (on.has("body")) jobs.push(syncHealthIfStale());
  if (on.has("money")) jobs.push(syncMoneyIfStale());
  if (on.has("business")) jobs.push(syncShopifyIfStale(), syncSquareIfStale(), syncStripeIfStale());
  if (on.has("training") || on.has("body")) jobs.push(syncHevyIfStale());
  await Promise.allSettled(jobs);
}

export async function refreshAll(): Promise<RefreshReport> {
  const started = Date.now();

  // A source only syncs when a widget that shows it is on the dashboard: if
  // someone kept money off, the app never touches their bank or brokerage.
  const on = new Set(((await getLayout()) ?? []).map((i) => i.id));
  const wanted = (id: string, label: string, by: WidgetId[], fn: () => Promise<SourceResult>) =>
    by.some((w) => on.has(w))
      ? run(id, label, fn)
      : Promise.resolve<SourceResult>({ id, label, status: "skipped", detail: "Widget not on dashboard" });

  const all = await Promise.all([
    wanted("google_health", "Sleep & steps", ["body"], refreshHealth),
    wanted("shopify", "Shopify sales", ["business"], refreshShopify),
    wanted("square", "Square sales", ["business"], refreshSquare),
    wanted("stripe", "Stripe sales", ["business"], refreshStripe),
    wanted("plaid", "Spending", ["money"], refreshMoney),
    wanted("hevy", "Workouts", ["training", "body"], refreshWorkouts),
    wanted("market", "Market prices", ["portfolio"], refreshPrices),
  ]);
  // Sources for widgets they don't use are left out of the report: a list of
  // "not on dashboard" lines for things like Stripe reads as a list of problems.
  const sources = all.filter((s) => s.detail !== "Widget not on dashboard");

  return {
    at: new Date().toISOString(),
    ms: Date.now() - started,
    sources,
    ok: sources.filter((s) => s.status === "ok").length,
    failed: sources.filter((s) => s.status === "error").length,
    skipped: sources.filter((s) => s.status === "skipped").length,
  };
}
