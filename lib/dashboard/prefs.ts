import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings, auditLog } from "@/lib/db/schema";
import { linkedAccounts, unlinkAccount } from "@/lib/plaid/client";
import { savePrayerSettings } from "@/lib/widgets/prayers/settings";
import { addStarterContent } from "./starter";
import {
  BILLING_LIVE,
  normalizeAnswers,
  normalizeLayout,
  normalizePlan,
  type Answers,
  type LayoutItem,
  type PlanId,
} from "./catalog";

/**
 * The two settings onboarding produces. A missing "layout" row is what
 * "hasn't onboarded yet" means; the dashboard redirects to /welcome on it.
 */
const LAYOUT = "dashboard.layout";
const ONBOARDING = "onboarding";
const PLAN = "plan";

async function read(key: string): Promise<unknown> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value;
}

async function write(key: string, value: unknown) {
  const updatedAt = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt } });
}

export async function getLayout(): Promise<LayoutItem[] | null> {
  const v = await read(LAYOUT);
  return v === undefined ? null : normalizeLayout(v);
}

export async function saveLayout(items: unknown, actor: "user" | "rafiq" = "user") {
  const clean = normalizeLayout(items);
  await write(LAYOUT, clean);
  await db.insert(auditLog).values({
    actor,
    action: "dashboard.layout",
    tableName: "app_settings",
    payload: clean,
  });
  return clean;
}

export async function getOnboarding(): Promise<{ answers: Answers; completedAt: string } | null> {
  const v = (await read(ONBOARDING)) as { answers?: unknown; completedAt?: string } | undefined;
  if (!v) return null;
  return { answers: normalizeAnswers(v.answers), completedAt: v.completedAt ?? "" };
}

export async function saveOnboarding(answers: unknown, items: unknown, plan: unknown, prayer?: unknown) {
  const clean = normalizeAnswers(answers);
  await write(ONBOARDING, { answers: clean, completedAt: new Date().toISOString() });
  if (prayer) await savePrayerSettings(prayer);
  await addStarterContent(clean);
  // With billing off nobody picks a plan, so setup must not overwrite one.
  if (BILLING_LIVE) await savePlan(plan);
  return saveLayout(items, "user");
}

/**
 * Anyone who hasn't picked a plan is on Free. Billing isn't live, so this is
 * the user's own choice for now; when Stripe lands, it becomes the webhook's job.
 */
export async function getPlan(): Promise<PlanId> {
  return normalizePlan(await read(PLAN)) ?? "free";
}

export async function savePlan(plan: unknown) {
  const clean = normalizePlan(plan) ?? "free";
  await write(PLAN, clean);
  await db.insert(auditLog).values({ actor: "user", action: "plan.change", tableName: "app_settings", payload: { plan: clean } });
  // Automatic bank sync is Pro, and Plaid bills every linked account every
  // month whether it syncs or not, so moving to Free unlinks them at Plaid.
  // Transactions already imported stay.
  if (clean === "free" && BILLING_LIVE) {
    for (const item of await linkedAccounts()) await unlinkAccount(item.itemId);
  }
  return clean;
}
