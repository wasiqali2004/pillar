import "server-only";
import { gte, sql } from "drizzle-orm";
import { defineWidget } from "../types";
import { BodyTile } from "./BodyTile";
import { db } from "@/lib/db";
import { bodyMetrics, workouts, auditLog } from "@/lib/db/schema";
import { syncHealthIfStale, healthStatus } from "@/lib/health/google-health";
import {
  localDate,
  shiftDate,
  recentDates,
  startOfWeek,
  startOfMonth,
} from "@/lib/date";

export type BodyData = {
  today: string;
  /**
   * Oldest → newest, 7 entries. null = no data logged that day.
   * Steps and calories end yesterday — today's totals are still climbing, so
   * the tile leads with the last finished day. Sleep ends today (last night).
   */
  steps7: (number | null)[];
  stepsToday: number | null;
  stepsYesterday: number | null;
  stepsAvg: number | null;
  sleep7: (number | null)[];
  sleepLast: number | null;
  /** The date of that night, which isn't today until the watch has uploaded it. */
  sleepLastOn: string | null;
  sleepAvg: number | null;
  calories7: (number | null)[];
  caloriesToday: number | null;
  caloriesYesterday: number | null;
  caloriesAvg: number | null;
  /** Connected to Google Health, but before steps/calories were requested. */
  needsReconnect: boolean;
  /** Nothing has ever been recorded — no sync, no upload, no manual log. */
  noData: boolean;
  weightLatest: number | null;
  weightChange30: number | null;
  workoutsWeek: number;
  workoutsMonth: number;
};

export async function loadBody(): Promise<BodyData> {
  // Pulls sleep, steps and calories from Google Health if the last pull has
  // gone stale. Throttled and non-throwing, so the tile renders either way.
  await syncHealthIfStale();
  const health = await healthStatus();

  const today = localDate();
  const week = startOfWeek(today);
  const month = startOfMonth(today);

  // Workouts are the Training log (by hand, Hevy or Rafiq), counted by the day they belong to.
  const [metrics, weekWorkouts, monthWorkouts] = await Promise.all([
    db
      .select()
      .from(bodyMetrics)
      .where(gte(bodyMetrics.localDate, shiftDate(today, -35))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(workouts)
      .where(gte(workouts.localDate, week)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(workouts)
      .where(gte(workouts.localDate, month)),
  ]);
  const earlier = metrics;

  const byDate = new Map(metrics.map((m) => [m.localDate, m]));
  const last7 = recentDates(7, today).reverse();

  const yesterday = shiftDate(today, -1);
  const finished7 = recentDates(7, yesterday).reverse();

  const steps7 = finished7.map((d) => byDate.get(d)?.steps ?? null);
  const sleep7 = last7.map((d) => byDate.get(d)?.sleepMinutes ?? null);
  const calories7 = finished7.map((d) => byDate.get(d)?.caloriesBurned ?? null);

  const avg = (xs: (number | null)[]) => {
    const vals = xs.filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b) / vals.length) : null;
  };

  // Weight: most recent reading, and the change since the oldest in the window.
  const weighed = earlier
    .filter((m) => m.weightGrams != null)
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  const weightLatest = weighed.at(-1)?.weightGrams ?? null;
  const weightFirst = weighed[0]?.weightGrams ?? null;

  return {
    today,
    steps7,
    stepsToday: byDate.get(today)?.steps ?? null,
    stepsYesterday: byDate.get(yesterday)?.steps ?? null,
    stepsAvg: avg(steps7),
    sleep7,
    // The most recent night on record, not strictly today's. A watch often
    // hasn't uploaded last night by the time the dashboard is opened, and a
    // dash sitting beside working step and calorie rings reads as broken
    // rather than as "not synced yet".
    sleepLast: [...sleep7].reverse().find((v) => v != null) ?? null,
    sleepLastOn: [...last7].reverse().find((d) => byDate.get(d)?.sleepMinutes != null) ?? null,
    sleepAvg: avg(sleep7),
    calories7,
    caloriesToday: byDate.get(today)?.caloriesBurned ?? null,
    caloriesYesterday: byDate.get(yesterday)?.caloriesBurned ?? null,
    caloriesAvg: avg(calories7),
    needsReconnect: health.connected && (!health.activityGranted || health.expired),
    noData: metrics.length === 0,
    weightLatest,
    weightChange30:
      weightLatest != null && weightFirst != null && weighed.length > 1
        ? weightLatest - weightFirst
        : null,
    workoutsWeek: Number(weekWorkouts[0]?.n ?? 0),
    workoutsMonth: Number(monthWorkouts[0]?.n ?? 0),
  };
}

/** Upserts today's row — one row per day, so re-logging corrects rather than duplicates. */
export async function logBody(
  input: {
    steps?: number | null;
    sleepMinutes?: number | null;
    weightGrams?: number | null;
  },
  source: "ui" | "rafiq" = "ui",
) {
  const day = localDate();
  const patch = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v != null && !Number.isNaN(v)),
  );
  if (Object.keys(patch).length === 0) return { ok: false };

  await db
    .insert(bodyMetrics)
    .values({ localDate: day, source, ...patch })
    .onConflictDoUpdate({ target: bodyMetrics.localDate, set: patch });

  await db.insert(auditLog).values({
    actor: source === "rafiq" ? "rafiq" : "user",
    action: "body.log",
    tableName: "body_metrics",
    payload: { localDate: day, ...patch },
  });

  return { ok: true };
}

export async function bodySummary() {
  const d = await loadBody();
  return {
    steps_today_so_far: d.stepsToday,
    steps_yesterday: d.stepsYesterday,
    steps_7day_avg: d.stepsAvg,
    sleep_latest_minutes: d.sleepLast,
    sleep_latest_date: d.sleepLastOn,
    sleep_7day_avg_minutes: d.sleepAvg,
    calories_burned_today_so_far: d.caloriesToday,
    calories_burned_yesterday: d.caloriesYesterday,
    calories_burned_7day_avg: d.caloriesAvg,
    weight_grams: d.weightLatest,
    weight_change_30d_grams: d.weightChange30,
    workouts_this_week: d.workoutsWeek,
    workouts_this_month: d.workoutsMonth,
  };
}

export const bodyWidget = defineWidget<BodyData>({
  id: "body",
  title: "Body",
  size: "sm",
  span: 6,
  group: { id: "health", label: "Health" },
  refresh: "live",
  load: loadBody,
  Tile: BodyTile,
  tools: [
    {
      name: "get_body_status",
      description:
        "Steps, calories burned, last night's sleep, weight and workout counts — today, 7-day averages, and 30-day weight change. Steps, sleep and calories sync from the Fitbit via Google Health.",
      input_schema: { type: "object", properties: {} },
      handler: bodySummary,
    },
    {
      name: "log_body_metric",
      description:
        "Record today's steps, sleep (in minutes) or weight (in grams). Only the fields provided are changed.",
      input_schema: {
        type: "object",
        properties: {
          steps: { type: "number" },
          sleepMinutes: { type: "number" },
          weightGrams: { type: "number" },
        },
      },
      write: true,
      handler: (input: Parameters<typeof logBody>[0]) => logBody(input, "rafiq"),
    },
  ],
});
