import "server-only";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { workouts, workoutExercises, routines } from "@/lib/db/schema";
import type { MuscleGroup } from "./muscles";
import { localDate, shiftDate, startOfWeek, startOfMonth, dayOfMonth, daysBetween } from "@/lib/date";

/**
 * The "how am I doing" layer over the workout log: streaks, weekly target,
 * personal records, the consistency calendar. Computed from every stored
 * workout — Hevy-synced and hand-logged alike — so it's independent of which
 * day the section is showing.
 */

/** His split is three days (Chest+Bicep, Legs+Shoulders, Back+Tricep); he
    often goes over, which the ring shows as overflow rather than capping. */
export const WEEKLY_GOAL = 3;
export type Split = "Push" | "Pull" | "Legs" | "Rest" | "Other";

/**
 * Which muscles belong to which day, per HIS split — not the textbook one:
 * triceps go with back (Back and Tricep), shoulders with legs.
 */
const SPLIT_OF: Record<MuscleGroup, Split> = {
  chest: "Push",
  biceps: "Push",
  lats: "Pull",
  traps: "Pull",
  lower_back: "Pull",
  triceps: "Pull",
  forearms: "Pull",
  quads: "Legs",
  hamstrings: "Legs",
  glutes: "Legs",
  calves: "Legs",
  shoulders: "Legs",
  abs: "Other",
  obliques: "Other",
};

/**
 * Push / Pull / Legs for one session. The routine's own label wins; then the
 * title ("Chest and bi", "Rushed legs and shoulders"); then whichever day
 * most of its exercises belong to. The old "Morning workout ☀️" sessions
 * only ever get classified by that last step.
 */
function classify(
  title: string,
  muscles: MuscleGroup[],
  routineSplit: Map<string, string>,
): Split {
  const fromRoutine = routineSplit.get(title.trim().toLowerCase());
  if (fromRoutine && ["Push", "Pull", "Legs"].includes(fromRoutine)) return fromRoutine as Split;
  const t = title.toLowerCase();
  if (/\brest\b/.test(t)) return "Rest";
  if (/\bleg/.test(t)) return "Legs";
  if (/\bchest|\bpush/.test(t)) return "Push";
  if (/\bback\b|\bpull/.test(t)) return "Pull";
  const tally = new Map<Split, number>();
  for (const m of muscles) {
    const sp = SPLIT_OF[m];
    if (sp !== "Other") tally.set(sp, (tally.get(sp) ?? 0) + 1);
  }
  const top = [...tally].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : "Other";
}

export type PR = {
  date: string;
  exercise: string;
  loadGrams: number;
  prevGrams: number;
  reps: number | null;
};

export type Progress = {
  /** Display unit, inferred from the loads themselves — see detectUnit(). */
  unit: "lb" | "kg";
  weeklyGoal: number;
  /** Server's local date, so the client calendar agrees on "today". */
  today: string;
  thisWeek: number;
  lastWeek: number;
  /** Consecutive weeks meeting the goal, ending this week (or last week, if
      this one hasn't reached it yet — a week in progress doesn't break it). */
  weekStreak: number;
  thisMonth: number;
  /** Same number of elapsed days, one month back. */
  lastMonthToDate: number;
  setsThisWeek: number;
  setsLastWeek: number;
  totalSessions: number;
  firstDate: string | null;
  /** Every session, oldest first, tagged Push/Pull/Legs — the month
      calendar pages through these on the client. */
  sessions: { date: string; title: string; split: Split }[];
  /** Newest first, last 30 days. */
  recentPRs: PR[];
  prsThisMonth: number;
  /** Exercises that set a PR on the day being viewed — badged in the list. */
  dayPRs: string[];
  latest: {
    date: string;
    title: string;
    exercises: number;
    sets: number;
    prs: number;
    daysAgo: number;
  } | null;
};

/**
 * Hevy stores kilograms, but a load entered as 190 lb arrives as 86.183 kg.
 * If most loads are whole or half pounds, he logs in pounds — show pounds.
 */
function detectUnit(loads: number[]): "lb" | "kg" {
  if (loads.length === 0) return "kg";
  const clean = loads.filter((g) => {
    const lb = g / 1000 / 0.45359237;
    return Math.abs(lb * 2 - Math.round(lb * 2)) < 0.04;
  }).length;
  return clean / loads.length > 0.6 ? "lb" : "kg";
}

export async function loadProgress(viewDate?: string): Promise<Progress> {
  const today = localDate();
  const all = await db.select().from(workouts).orderBy(asc(workouts.localDate), asc(workouts.id));
  const ex = all.length
    ? await db
        .select()
        .from(workoutExercises)
        .where(inArray(workoutExercises.workoutId, all.map((w) => w.id)))
    : [];

  const exByWorkout = new Map<number, typeof ex>();
  for (const e of ex) {
    const list = exByWorkout.get(e.workoutId) ?? [];
    list.push(e);
    exByWorkout.set(e.workoutId, list);
  }

  const routineSplit = new Map(
    (await db.select().from(routines)).map((r) => [r.name.trim().toLowerCase(), r.splitLabel ?? ""]),
  );

  const countBetween = (from: string, to: string) =>
    all.filter((w) => w.localDate >= from && w.localDate <= to).length;
  const setsBetween = (from: string, to: string) =>
    all
      .filter((w) => w.localDate >= from && w.localDate <= to)
      .reduce((n, w) => n + (exByWorkout.get(w.id) ?? []).reduce((m, e) => m + (e.sets ?? 0), 0), 0);

  const wk = startOfWeek(today);
  const thisWeek = countBetween(wk, today);
  const lastWeek = countBetween(shiftDate(wk, -7), shiftDate(wk, -1));

  // ── week streak ──
  let weekStreak = thisWeek >= WEEKLY_GOAL ? 1 : 0;
  for (let start = shiftDate(wk, -7); ; start = shiftDate(start, -7)) {
    if (countBetween(start, shiftDate(start, 6)) >= WEEKLY_GOAL) weekStreak++;
    else break;
    if (all.length && start < all[0].localDate) break;
  }

  // ── month ──
  const mStart = startOfMonth(today);
  const prevMonthStart = startOfMonth(shiftDate(mStart, -1));
  const prevCutoff = shiftDate(prevMonthStart, dayOfMonth(today) - 1);

  // ── personal records: a heavier top set than any before it ──
  const best = new Map<string, number>();
  const prs: PR[] = [];
  const prsByWorkout = new Map<number, number>();
  for (const w of all) {
    for (const e of exByWorkout.get(w.id) ?? []) {
      if (!e.loadGrams) continue;
      const prev = best.get(e.name);
      if (prev != null && e.loadGrams > prev + 1) {
        prs.push({ date: w.localDate, exercise: e.name, loadGrams: e.loadGrams, prevGrams: prev, reps: e.reps });
        prsByWorkout.set(w.id, (prsByWorkout.get(w.id) ?? 0) + 1);
      }
      if (prev == null || e.loadGrams > prev) best.set(e.name, e.loadGrams);
    }
  }
  const monthAgo = shiftDate(today, -30);

  const sessions = all.map((w) => ({
    date: w.localDate,
    title: w.title,
    split: classify(
      w.title,
      (exByWorkout.get(w.id) ?? []).map((e) => e.muscleGroup),
      routineSplit,
    ),
  }));

  const last = all.at(-1);
  const lastEx = last ? exByWorkout.get(last.id) ?? [] : [];

  return {
    unit: detectUnit(ex.map((e) => e.loadGrams).filter((g): g is number => !!g)),
    weeklyGoal: WEEKLY_GOAL,
    today,
    thisWeek,
    lastWeek,
    weekStreak,
    thisMonth: countBetween(mStart, today),
    lastMonthToDate: countBetween(prevMonthStart, prevCutoff),
    setsThisWeek: setsBetween(wk, today),
    setsLastWeek: setsBetween(shiftDate(wk, -7), shiftDate(wk, -1)),
    totalSessions: all.length,
    firstDate: all[0]?.localDate ?? null,
    sessions,
    recentPRs: prs.filter((p) => p.date >= monthAgo).reverse().slice(0, 8),
    prsThisMonth: prs.filter((p) => p.date >= mStart).length,
    dayPRs: viewDate ? prs.filter((p) => p.date === viewDate).map((p) => p.exercise) : [],
    latest: last
      ? {
          date: last.localDate,
          title: last.title,
          exercises: lastEx.length,
          sets: lastEx.reduce((n, e) => n + (e.sets ?? 0), 0),
          prs: prsByWorkout.get(last.id) ?? 0,
          daysAgo: daysBetween(last.localDate, today),
        }
      : null,
  };
}
