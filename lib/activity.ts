import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings, auditLog } from "@/lib/db/schema";
import { INACTIVE_UNLINK_DAYS } from "@/lib/dashboard/catalog";
import { linkedAccounts, unlinkAccount } from "@/lib/plaid/client";

/**
 * Plaid bills for every linked bank every month, whether or not anyone opens
 * the app. So the app remembers when it was last opened, and a scheduled job
 * (app/api/cron/unlink-inactive) unlinks the banks of anyone who has been
 * away for INACTIVE_UNLINK_DAYS. Past transactions stay; they reconnect in
 * one tap.
 *
 * Keyed globally for now, like the rest of app_settings: one person per
 * install until sign-in accounts exist. It moves to a per-user row then.
 */

const LAST_SEEN = "activity.lastSeen";
const NOTICE = "notice.banksUnlinked";
/** A write per page view would be wasteful; an hour is plenty of precision for 30 days. */
const TOUCH_EVERY_MS = 60 * 60 * 1000;

async function read(key: string): Promise<unknown> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value;
}

async function write(key: string, value: unknown) {
  const updatedAt = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt } });
}

/** Called when the dashboard loads. Never throws, so a failed write can't break the page. */
export async function touchActive(): Promise<void> {
  try {
    const last = await read(LAST_SEEN);
    if (typeof last === "string" && Date.now() - Date.parse(last) < TOUCH_EVERY_MS) return;
    await write(LAST_SEEN, new Date().toISOString());
  } catch {
    // Activity tracking is best-effort.
  }
}

/**
 * Unlinks every bank if the app hasn't been opened for INACTIVE_UNLINK_DAYS.
 * With no recorded visit at all, the clock starts now, so a fresh install is
 * never unlinked on its first sweep.
 */
export async function unlinkInactiveBanks(now = new Date()): Promise<{ unlinked: number; idleDays: number }> {
  const last = await read(LAST_SEEN);
  if (typeof last !== "string") {
    await write(LAST_SEEN, now.toISOString());
    return { unlinked: 0, idleDays: 0 };
  }
  const idleDays = Math.floor((now.getTime() - Date.parse(last)) / 86_400_000);
  if (idleDays < INACTIVE_UNLINK_DAYS) return { unlinked: 0, idleDays };

  const items = await linkedAccounts();
  for (const item of items) await unlinkAccount(item.itemId);
  if (items.length > 0) {
    await write(NOTICE, { at: now.toISOString(), count: items.length, idleDays });
    await db.insert(auditLog).values({
      actor: "system",
      action: "plaid.unlink_inactive",
      tableName: "plaid_items",
      payload: { count: items.length, idleDays },
    });
  }
  return { unlinked: items.length, idleDays };
}

export type UnlinkNotice = { at: string; count: number; idleDays: number };

/** Set after an inactivity unlink, until the user reconnects a bank. */
export async function getUnlinkNotice(): Promise<UnlinkNotice | null> {
  const v = await read(NOTICE);
  return v && typeof v === "object" ? (v as UnlinkNotice) : null;
}

export async function clearUnlinkNotice() {
  await db.delete(appSettings).where(eq(appSettings.key, NOTICE));
}
