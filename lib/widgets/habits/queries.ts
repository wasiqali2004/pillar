import "server-only";
import { and, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { habits, habitLogs, auditLog } from "@/lib/db/schema";
import { localDate, shiftDate, recentDates, daysBetween } from "@/lib/date";

/**
 * ── Streak rules, written down before they were written in code ──
 *
 * Day boundary   4am America/Toronto (lib/date.ts). A 1am log counts for
 *                the night before.
 * Daily habit    Streak is consecutive local_dates with a log, counting back
 *                from today. If today isn't logged yet the count starts at
 *                yesterday — the day isn't over, so you don't lose a streak
 *                at 4:01am. If yesterday is also missing, the streak is 0.
 * Grace          None beyond that. One fully missed day resets to zero.
 * Retroactive    Repairs a streak automatically, because the streak is derived
 *                from the logs rather than stored as a counter.
 * x_per_week     No streak. Shows progress toward the weekly target instead,
 *                since "consecutive" isn't meaningful for a 4-times-a-week habit.
 */

const WINDOW_DAYS = 90;
const STRIP_DAYS = 14;

export type HabitStatus = {
  id: number;
  name: string;
  cadence: "daily" | "weekly" | "x_per_week";
  targetCount: number;
  unit: string | null;
  doneToday: boolean;
  /** Daily habits only; 0 for x_per_week. */
  streak: number;
  /** Days hit in the last 7, for x_per_week habits. */
  weekCount: number;
  /** Oldest → newest, length STRIP_DAYS. */
  strip: boolean[];
};

export type HabitsData = {
  today: string;
  items: HabitStatus[];
  doneCount: number;
  totalCount: number;
};

export async function loadHabits(): Promise<HabitsData> {
  const today = localDate();
  const since = shiftDate(today, -WINDOW_DAYS);

  const [rows, logs] = await Promise.all([
    db
      .select()
      .from(habits)
      .where(isNull(habits.archivedAt))
      .orderBy(habits.sortOrder),
    db
      .select({ habitId: habitLogs.habitId, localDate: habitLogs.localDate })
      .from(habitLogs)
      .where(gte(habitLogs.localDate, since)),
  ]);

  const byHabit = new Map<number, Set<string>>();
  for (const l of logs) {
    let set = byHabit.get(l.habitId);
    if (!set) byHabit.set(l.habitId, (set = new Set()));
    set.add(l.localDate);
  }

  const stripDates = recentDates(STRIP_DAYS, today).reverse(); // oldest → newest
  const last7 = recentDates(7, today);

  const items: HabitStatus[] = rows.map((h) => {
    const done = byHabit.get(h.id) ?? new Set<string>();
    return {
      id: h.id,
      name: h.name,
      cadence: h.cadence,
      targetCount: h.targetCount,
      unit: h.unit,
      doneToday: done.has(today),
      streak: h.cadence === "daily" ? computeStreak(done, today) : 0,
      weekCount: last7.filter((d) => done.has(d)).length,
      strip: stripDates.map((d) => done.has(d)),
    };
  });

  return {
    today,
    items,
    doneCount: items.filter((i) => i.doneToday).length,
    totalCount: items.length,
  };
}

function computeStreak(done: Set<string>, today: string): number {
  // Today isn't over — start from yesterday if it hasn't been logged yet.
  let cursor = done.has(today) ? today : shiftDate(today, -1);
  if (!done.has(cursor)) return 0;

  let streak = 0;
  while (done.has(cursor) && streak <= WINDOW_DAYS) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

/** Idempotent: logging twice in one day is a no-op, not a duplicate row. */
export async function toggleHabit(
  habitId: number,
  source: "ui" | "rafiq" = "ui",
): Promise<{ done: boolean }> {
  const day = localDate();

  const existing = await db
    .select({ id: habitLogs.id })
    .from(habitLogs)
    .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.localDate, day)))
    .limit(1);

  if (existing.length > 0) {
    await db.delete(habitLogs).where(eq(habitLogs.id, existing[0].id));
    await recordAudit(source, "habit.unlog", habitId, { localDate: day });
    return { done: false };
  }

  await db.insert(habitLogs).values({ habitId, localDate: day, source });
  await recordAudit(source, "habit.log", habitId, { localDate: day });
  return { done: true };
}

/** One-way version of toggleHabit for Rafiq — see markPrayer. */
export async function markHabit(habitId: number): Promise<{ done: boolean; alreadyLogged?: boolean }> {
  const existing = await db
    .select({ id: habitLogs.id })
    .from(habitLogs)
    .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.localDate, localDate())))
    .limit(1);
  if (existing.length > 0) return { done: true, alreadyLogged: true };
  return toggleHabit(habitId, "rafiq");
}

async function recordAudit(
  actor: "ui" | "rafiq",
  action: string,
  rowId: number,
  payload: unknown,
) {
  await db.insert(auditLog).values({
    actor: actor === "rafiq" ? "rafiq" : "user",
    action,
    tableName: "habit_logs",
    rowId,
    payload,
  });
}

export async function createHabit(input: {
  name: string;
  cadence?: "daily" | "weekly" | "x_per_week";
  targetCount?: number;
  unit?: string | null;
}) {
  if (!input.name || input.name.trim() === "") {
    return { ok: false, error: "Habit name is required." };
  }

  const result = await db
    .insert(habits)
    .values({
      name: input.name.trim(),
      cadence: input.cadence ?? "daily",
      targetCount: input.targetCount ?? 1,
      unit: input.unit ?? null,
      sortOrder: 0,
    })
    .returning();

  await recordAudit("ui", "habit.create", result[0].id, result[0]);
  return { ok: true, id: result[0].id };
}

export async function updateHabit(
  habitId: number,
  input: {
    name?: string;
    cadence?: "daily" | "weekly" | "x_per_week";
    targetCount?: number;
    unit?: string | null;
  },
) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.cadence !== undefined) patch.cadence = input.cadence;
  if (input.targetCount !== undefined) patch.targetCount = input.targetCount;
  if (input.unit !== undefined) patch.unit = input.unit;

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  await db.update(habits).set(patch).where(eq(habits.id, habitId));
  await recordAudit("ui", "habit.update", habitId, patch);
  return { ok: true };
}

export async function deleteHabit(habitId: number) {
  await db
    .update(habits)
    .set({ archivedAt: new Date().toISOString() })
    .where(eq(habits.id, habitId));
  await recordAudit("ui", "habit.delete", habitId, { habitId });
  return { ok: true };
}

/** Unused until Phase 3, but proves the tool surface exists from day one. */
export async function habitStatusSummary() {
  const data = await loadHabits();
  return {
    date: data.today,
    completed: `${data.doneCount}/${data.totalCount}`,
    habits: data.items.map((i) => ({
      id: i.id,
      name: i.name,
      done_today: i.doneToday,
      streak_days: i.streak,
      last_7_days: i.weekCount,
      days_since_last:
        i.strip.lastIndexOf(true) === -1
          ? null
          : daysBetween(
              recentDates(STRIP_DAYS, data.today).reverse()[
                i.strip.lastIndexOf(true)
              ],
              data.today,
            ),
    })),
  };
}
