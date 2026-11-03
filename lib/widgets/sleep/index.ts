import "server-only";
import { gte } from "drizzle-orm";
import { defineWidget } from "../types";
import { SleepTile } from "./SleepTile";
import { db } from "@/lib/db";
import { bodyMetrics, auditLog } from "@/lib/db/schema";
import { localDate, shiftDate, recentDates, weekdayLabel } from "@/lib/date";

export { scoreBand, BAND_LABELS, type SleepBand } from "./bands";

/** How many nights the chart shows. Two weeks reads as a pattern, not noise. */
const WINDOW = 14;

export type SleepNight = {
  date: string;
  /** "Mon", "Tue"… */
  weekday: string;
  minutes: number | null;
  /** Fitbit's 0–100 nightly score. */
  score: number | null;
};

export type SleepData = {
  today: string;
  /** Oldest → newest. */
  nights: SleepNight[];
  lastMinutes: number | null;
  lastScore: number | null;
  avgMinutes: number | null;
  avgScore: number | null;
  /** Consecutive nights, counting back, that cleared the 7h target. */
  streak7h: number;
  /** Nights in the window with any data at all. */
  logged: number;
};

const TARGET_MINUTES = 7 * 60;

export async function loadSleep(): Promise<SleepData> {
  const today = localDate();

  const rows = await db
    .select()
    .from(bodyMetrics)
    .where(gte(bodyMetrics.localDate, shiftDate(today, -(WINDOW + 1))));

  const byDate = new Map(rows.map((r) => [r.localDate, r]));

  // recentDates is newest-first; the chart reads left-to-right as time passing.
  const nights: SleepNight[] = recentDates(WINDOW, today)
    .reverse()
    .map((date) => ({
      date,
      weekday: weekdayLabel(date),
      minutes: byDate.get(date)?.sleepMinutes ?? null,
      score: byDate.get(date)?.sleepScore ?? null,
    }));

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((n): n is number => n != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b) / v.length) : null;
  };

  // Walk back from the newest night; the first miss (or gap) ends the run.
  let streak7h = 0;
  for (let i = nights.length - 1; i >= 0; i--) {
    const m = nights[i].minutes;
    if (m == null || m < TARGET_MINUTES) break;
    streak7h++;
  }

  const withData = nights.filter((n) => n.minutes != null || n.score != null);

  return {
    today,
    nights,
    lastMinutes: withData.at(-1)?.minutes ?? null,
    lastScore: withData.at(-1)?.score ?? null,
    avgMinutes: avg(nights.map((n) => n.minutes)),
    avgScore: avg(nights.map((n) => n.score)),
    streak7h,
    logged: withData.length,
  };
}

/**
 * Upserts one night. Defaults to today's row, which under the 4am rollover is
 * the night you just woke up from — so "log last night" needs no date.
 */
export async function logSleep(
  input: {
    date?: string;
    minutes?: number | null;
    score?: number | null;
  },
  source: "ui" | "rafiq" | "health_export" = "ui",
) {
  const day = input.date ?? localDate();

  if (input.score != null && (input.score < 0 || input.score > 100)) {
    return { ok: false as const, error: "Sleep score must be 0–100." };
  }
  if (input.minutes != null && (input.minutes < 0 || input.minutes > 24 * 60)) {
    return { ok: false as const, error: "Sleep minutes must be 0–1440." };
  }

  const patch: Record<string, number> = {};
  if (input.minutes != null) patch.sleepMinutes = Math.round(input.minutes);
  if (input.score != null) patch.sleepScore = Math.round(input.score);
  if (Object.keys(patch).length === 0) {
    return { ok: false as const, error: "Nothing to log." };
  }

  await db
    .insert(bodyMetrics)
    .values({ localDate: day, source, ...patch })
    .onConflictDoUpdate({ target: bodyMetrics.localDate, set: patch });

  await db.insert(auditLog).values({
    actor: source === "rafiq" ? "rafiq" : "user",
    action: "sleep.log",
    tableName: "body_metrics",
    payload: { localDate: day, ...patch },
  });

  return { ok: true as const };
}

export async function sleepSummary() {
  const d = await loadSleep();
  const hrs = (m: number | null) => (m == null ? null : +(m / 60).toFixed(2));
  return {
    last_night_hours: hrs(d.lastMinutes),
    last_night_score: d.lastScore,
    avg_hours_14d: hrs(d.avgMinutes),
    avg_score_14d: d.avgScore,
    nights_at_or_above_7h_streak: d.streak7h,
    nights_logged_of_14: d.logged,
    nights: d.nights
      .filter((n) => n.minutes != null || n.score != null)
      .map((n) => ({ date: n.date, hours: hrs(n.minutes), score: n.score })),
  };
}

export const sleepWidget = defineWidget<SleepData>({
  id: "sleep",
  title: "Sleep",
  size: "sm",
  group: { id: "health", label: "Health" },
  refresh: "live",
  load: loadSleep,
  Tile: SleepTile,
  tools: [
    {
      name: "get_sleep",
      description:
        "Nightly sleep for the last 14 nights: hours slept and Fitbit sleep score, plus 14-day averages and the current 7h streak.",
      input_schema: { type: "object", properties: {} },
      handler: sleepSummary,
    },
    {
      name: "log_sleep",
      description:
        "Record a night's sleep: duration in minutes and/or the Fitbit sleep score (0-100). Defaults to last night.",
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD. Omit for last night." },
          minutes: { type: "number" },
          score: { type: "number" },
        },
      },
      write: true,
      handler: (input: Parameters<typeof logSleep>[0]) => logSleep(input, "rafiq"),
    },
  ],
});
