"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, bodyMetrics } from "@/lib/db/schema";
import { MAX_DAYS, type HealthRow } from "./import";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Saves the daily totals a Fitbit/Takeout export produced in the browser.
 *
 * Upserts per day, and only writes the fields the file actually carried: an
 * export with steps but no sleep must not blank out a night that a previous
 * import or the Google Health sync already filled in.
 */
export async function importHealthAction(
  rows: HealthRow[],
): Promise<
  | { ok: true; days: number; from: string; to: string }
  | { ok: false; error: string }
> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "Nothing to import." };
  }
  if (rows.length > MAX_DAYS) {
    return { ok: false, error: `That's over ${MAX_DAYS} days at once. Import a shorter range.` };
  }

  const clean = rows.filter(
    (r) =>
      typeof r?.date === "string" &&
      DATE.test(r.date) &&
      // Guard against a misread date column turning into the year 0202.
      r.date >= "2007-01-01" &&
      r.date <= "2100-01-01" &&
      (inRange(r.steps, 0, 500_000) ||
        inRange(r.calories, 0, 30_000) ||
        inRange(r.sleepMinutes, 1, 1_440) ||
        inRange(r.sleepScore, 1, 100)),
  );
  if (clean.length === 0) {
    return { ok: false, error: "None of those days held a usable number." };
  }

  let written = 0;
  for (const r of clean) {
    const set: {
      steps?: number;
      caloriesBurned?: number;
      sleepMinutes?: number;
      sleepScore?: number;
    } = {};
    if (inRange(r.steps, 0, 500_000)) set.steps = Math.round(r.steps!);
    if (inRange(r.calories, 1, 30_000)) set.caloriesBurned = Math.round(r.calories!);
    if (inRange(r.sleepMinutes, 1, 1_440)) set.sleepMinutes = Math.round(r.sleepMinutes!);
    if (inRange(r.sleepScore, 1, 100)) set.sleepScore = Math.round(r.sleepScore!);
    if (Object.keys(set).length === 0) continue;

    await db
      .insert(bodyMetrics)
      .values({ localDate: r.date, source: "health_export", ...set })
      .onConflictDoUpdate({ target: bodyMetrics.localDate, set });
    written++;
  }

  const dates = clean.map((r) => r.date).sort();
  await db.insert(auditLog).values({
    actor: "user",
    action: "health.import_export",
    tableName: "body_metrics",
    payload: { days: written, from: dates[0], to: dates.at(-1) },
  });

  revalidatePath("/app");
  return { ok: true, days: written, from: dates[0], to: dates.at(-1)! };
}

function inRange(n: number | null | undefined, min: number, max: number): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}
