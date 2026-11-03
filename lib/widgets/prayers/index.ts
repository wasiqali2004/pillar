import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { defineWidget } from "../types";
import { PrayersTile } from "./PrayersTile";
import { db } from "@/lib/db";
import { prayerLogs, PRAYER_NAMES, type PrayerName } from "@/lib/db/schema";
import { auditLog } from "@/lib/db/schema";
import { localDate, shiftDate, userTz } from "@/lib/date";
import { methodLabel, prayerTimesFor } from "@/lib/prayer-options";
import { getPrayerSettings } from "./settings";

const LABELS: Record<PrayerName, string> = {
  fajr: "Fajr",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

export type PrayerRow = {
  name: PrayerName;
  label: string;
  /** ISO instant, formatted client-side so the server's TZ never leaks in. */
  at: string;
  prayed: boolean;
  passed: boolean;
  isNext: boolean;
};

export type PrayersData = {
  day: string;
  /** False until the user has set a location. The tile asks rather than guessing a city. */
  configured: boolean;
  rows: PrayerRow[];
  doneCount: number;
  method: string;
  madhab: string;
  place: string;
  /** Consecutive days with all five logged. */
  streak: number;
};

export async function loadPrayers(): Promise<PrayersData> {
  const day = localDate();
  const settings = await getPrayerSettings();
  const now = new Date();

  const logs = await db
    .select({ prayer: prayerLogs.prayer, localDate: prayerLogs.localDate })
    .from(prayerLogs)
    .where(gte(prayerLogs.localDate, shiftDate(day, -120)));

  if (!settings) {
    return { day, configured: false, rows: [], doneCount: 0, method: "", madhab: "", place: "", streak: computeFullDayStreak(logs, day) };
  }

  const times = prayerTimesFor(settings, day);

  const todaySet = new Set(
    logs.filter((l) => l.localDate === day).map((l) => l.prayer),
  );

  // The next prayer is the first one still ahead of us today.
  const upcoming = PRAYER_NAMES.find((p) => times[p] > now);

  const rows: PrayerRow[] = PRAYER_NAMES.map((name) => ({
    name,
    label: LABELS[name],
    at: times[name].toISOString(),
    prayed: todaySet.has(name),
    passed: times[name] <= now,
    isNext: name === upcoming,
  }));

  return {
    day,
    configured: true,
    rows,
    doneCount: rows.filter((r) => r.prayed).length,
    method: methodLabel(settings.method),
    madhab: settings.madhab,
    place: settings.place,
    streak: computeFullDayStreak(logs, day),
  };
}

/** Consecutive days where all five were logged. Today only counts once complete. */
function computeFullDayStreak(
  logs: { prayer: string; localDate: string }[],
  today: string,
): number {
  const byDate = new Map<string, Set<string>>();
  for (const l of logs) {
    let s = byDate.get(l.localDate);
    if (!s) byDate.set(l.localDate, (s = new Set()));
    s.add(l.prayer);
  }
  const complete = (d: string) => (byDate.get(d)?.size ?? 0) === 5;

  let cursor = complete(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (complete(cursor) && streak <= 120) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export async function togglePrayer(
  prayer: PrayerName,
  source: "ui" | "rafiq" = "ui",
) {
  const day = localDate();
  const existing = await db
    .select({ id: prayerLogs.id })
    .from(prayerLogs)
    .where(and(eq(prayerLogs.localDate, day), eq(prayerLogs.prayer, prayer)))
    .limit(1);

  const action = existing.length > 0 ? "prayer.unlog" : "prayer.log";
  if (existing.length > 0) {
    await db.delete(prayerLogs).where(eq(prayerLogs.id, existing[0].id));
  } else {
    await db.insert(prayerLogs).values({ localDate: day, prayer, source });
  }

  await db.insert(auditLog).values({
    actor: source === "rafiq" ? "rafiq" : "user",
    action,
    tableName: "prayer_logs",
    payload: { prayer, localDate: day },
  });

  return { prayed: existing.length === 0 };
}

/**
 * One-way version of togglePrayer for Rafiq. A toggle is right for a tap on
 * the tile, but "I prayed Asr" said twice must not un-log it the second time.
 */
export async function markPrayer(prayer: PrayerName) {
  const existing = await db
    .select({ id: prayerLogs.id })
    .from(prayerLogs)
    .where(and(eq(prayerLogs.localDate, localDate()), eq(prayerLogs.prayer, prayer)))
    .limit(1);
  if (existing.length > 0) return { prayed: true, alreadyLogged: true };
  return togglePrayer(prayer, "rafiq");
}

export async function prayerSummary() {
  const d = await loadPrayers();
  if (!d.configured) {
    return { date: d.day, not_set_up: "The user hasn't set a location, so there are no prayer times. Point them to Settings; don't guess times." };
  }
  const tz = userTz();
  return {
    date: d.day,
    completed: `${d.doneCount}/5`,
    full_day_streak: d.streak,
    // Local wall-clock time, not the raw UTC instant: Rafiq reads this
    // straight to the user, and "Fajr at 10:12" would be wrong by hours.
    prayers: d.rows.map((r) => ({
      name: r.label,
      time: new Date(r.at).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: tz }),
      prayed: r.prayed,
    })),
    calculation: { method: d.method, madhab: d.madhab, location: d.place },
  };
}

export const prayersWidget = defineWidget<PrayersData>({
  id: "prayers",
  title: "Prayers",
  size: "sm",
  group: { id: "deen", label: "Deen" },
  refresh: "live",
  load: loadPrayers,
  Tile: PrayersTile,
  tools: [
    {
      name: "get_prayer_status",
      description:
        "Today's five prayer times, which have been prayed, and the current all-five streak.",
      input_schema: { type: "object", properties: {} },
      handler: prayerSummary,
    },
    {
      name: "log_prayer",
      description: "Mark one of the five daily prayers as prayed today.",
      input_schema: {
        type: "object",
        properties: {
          prayer: { type: "string", enum: [...PRAYER_NAMES] },
        },
        required: ["prayer"],
      },
      write: true,
      handler: ({ prayer }: { prayer: PrayerName }) =>
        markPrayer(prayer),
    },
  ],
});
