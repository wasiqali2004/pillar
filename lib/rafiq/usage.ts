import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { RAFIQ_MONTHLY_MESSAGES } from "@/lib/dashboard/catalog";
import { userTz } from "@/lib/date";

/**
 * Each message a user sends Rafiq is a paid call to Claude, so everyone gets a
 * monthly allowance. Counted per calendar month in the user's timezone; the
 * count starts over by itself when the month changes. Each user has their own
 * database, so the count is theirs alone.
 */

const KEY = "rafiq.usage";

const thisMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: userTz() }).slice(0, 7);

export async function readUsed(): Promise<number> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  const v = row?.value as { month?: string; count?: number } | undefined;
  return v?.month === thisMonth() ? Number(v.count ?? 0) : 0;
}

/** Uses one message if any are left. Returns false once the month's allowance is spent. */
export async function consumeRafiqMessage(): Promise<boolean> {
  const used = await readUsed();
  if (used >= RAFIQ_MONTHLY_MESSAGES) return false;
  const value = { month: thisMonth(), count: used + 1 };
  const updatedAt = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key: KEY, value, updatedAt })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt } });
  return true;
}
