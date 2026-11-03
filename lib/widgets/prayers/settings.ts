import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSettings, auditLog } from "@/lib/db/schema";
import { normalizePrayerSettings, type PrayerSettings } from "@/lib/prayer-options";

const KEY = "prayer.settings";

/** Null until the user has said where they are. The tile asks rather than guessing. */
export async function getPrayerSettings(): Promise<PrayerSettings | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  return normalizePrayerSettings(row?.value);
}

export async function savePrayerSettings(input: unknown): Promise<PrayerSettings | null> {
  const value = normalizePrayerSettings(input);
  if (!value) return null;
  const updatedAt = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key: KEY, value, updatedAt })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt } });
  await db.insert(auditLog).values({
    actor: "user",
    action: "prayer.settings",
    tableName: "app_settings",
    payload: { place: value.place, method: value.method, madhab: value.madhab },
  });
  return value;
}
