import "server-only";
import { and, gte, lt, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import {
  bodyMetrics,
  habitLogs,
  habits,
  moneyEntries,
  prayerLogs,
  surahProgress,
  workouts,
  PRAYER_NAMES,
} from "@/lib/db/schema";
import { localDate, shiftDate, startOfWeek, weekdayLabel } from "@/lib/date";
import { getLayout } from "@/lib/dashboard/prefs";
import type { WidgetId } from "@/lib/dashboard/catalog";

/**
 * The week in numbers, counted from the database.
 *
 * Deliberately AI-free. Rafiq writes the words around these figures but never
 * produces the figures themselves — same rule as the Qur'an text: a number the
 * user acts on has to come from their own data, not from a model's guess. It
 * also means the review works with no API key and costs nothing to open.
 *
 * Every section is skipped when its widget is off the dashboard, so someone
 * who kept money off never gets a money paragraph.
 */

export type Trend = "up" | "down" | "flat" | "new";

export type Metric = {
  label: string;
  value: string;
  /** Same metric, the week before. */
  previous?: string;
  trend: Trend;
  /** Plain-language note, only when it adds something a number can't. */
  note?: string;
};

export type ReviewSection = {
  id: WidgetId | "training";
  title: string;
  headline: string;
  metrics: Metric[];
};

export type WeeklyReview = {
  /** Monday of the week under review. */
  weekStart: string;
  weekEnd: string;
  /** True while the week is still running. */
  partial: boolean;
  daysElapsed: number;
  sections: ReviewSection[];
  signals: Signal[];
};

/** Something worth saying out loud, ranked. */
export type Signal = {
  id: string;
  kind: "win" | "slip" | "nudge";
  text: string;
  /** Where to go to act on it. */
  href?: string;
  /** 1 is most important. */
  rank: number;
};

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

function trendOf(now: number, before: number, higherIsBetter = true): Trend {
  if (before === 0 && now === 0) return "flat";
  if (before === 0) return "new";
  const change = (now - before) / before;
  if (Math.abs(change) < 0.05) return "flat";
  const better = now > before;
  return better === higherIsBetter ? "up" : "down";
}

/** Rows in [from, to), for any table's date column. */
const between = (col: SQLiteColumn, from: string, to: string) =>
  and(gte(col, from), lt(col, to));

export async function buildWeeklyReview(at: string = localDate()): Promise<WeeklyReview> {
  const weekStart = startOfWeek(at);
  const weekEnd = shiftDate(weekStart, 7);
  const prevStart = shiftDate(weekStart, -7);
  const today = localDate();
  const partial = today < weekEnd;
  // Monday counts as one day in, so a review opened on Monday morning doesn't
  // divide by zero or claim a 0% week.
  const daysElapsed = partial ? Math.max(1, Math.min(7, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000) + 1)) : 7;

  const on = new Set(((await getLayout()) ?? []).map((i) => i.id));
  const wants = (...ids: WidgetId[]) => ids.some((i) => on.has(i));

  const sections: ReviewSection[] = [];
  const signals: Signal[] = [];

  if (wants("prayers", "deen")) {
    sections.push(await prayerSection(weekStart, weekEnd, prevStart, daysElapsed, signals));
  }
  if (wants("habits")) {
    sections.push(await habitSection(weekStart, weekEnd, prevStart, daysElapsed, signals));
  }
  if (wants("training", "body")) {
    sections.push(await trainingSection(weekStart, weekEnd, prevStart, signals));
  }
  if (wants("body")) {
    sections.push(await bodySection(weekStart, weekEnd, prevStart, signals, wants("prayers", "deen")));
  }
  if (wants("quran", "deen")) {
    const s = await quranSection();
    if (s) sections.push(s);
  }
  if (wants("money")) {
    sections.push(await moneySection(weekStart, weekEnd, prevStart, signals));
  }

  // Counts this early can't fairly be compared with a whole finished week, so
  // Monday morning doesn't open with a wall of red arrows.
  if (partial && daysElapsed < 5) {
    for (const s of sections) {
      for (const m of s.metrics) if (m.trend === "down") m.trend = "flat";
    }
  }

  signals.sort((a, b) => a.rank - b.rank);
  return { weekStart, weekEnd: shiftDate(weekEnd, -1), partial, daysElapsed, sections, signals };
}

/* ── prayers ──────────────────────────────────────────────────── */

async function prayerSection(
  from: string,
  to: string,
  prevFrom: string,
  daysElapsed: number,
  signals: Signal[],
): Promise<ReviewSection> {
  const [rows, prevRows] = await Promise.all([
    db.select().from(prayerLogs).where(between(prayerLogs.localDate, from, to)),
    db.select().from(prayerLogs).where(between(prayerLogs.localDate, prevFrom, from)),
  ]);

  const possible = daysElapsed * 5;
  const done = rows.length;
  const prevDone = prevRows.length;

  // Which of the five slips most: the one to name, rather than "you missed 9".
  const byPrayer = new Map(PRAYER_NAMES.map((p) => [p, 0]));
  for (const r of rows) byPrayer.set(r.prayer, (byPrayer.get(r.prayer) ?? 0) + 1);
  const weakest = [...byPrayer.entries()].sort((a, b) => a[1] - b[1])[0];

  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.localDate, (byDay.get(r.localDate) ?? 0) + 1);
  const fullDays = [...byDay.values()].filter((n) => n === 5).length;

  const metrics: Metric[] = [
    {
      label: "Prayers logged",
      value: `${done} of ${possible}`,
      previous: `${prevDone} of 35`,
      trend: trendOf(done, prevDone),
      note: `${pct(done, possible)}% of the week so far`,
    },
    { label: "Days all five", value: String(fullDays), trend: trendOf(fullDays, 0), note: fullDays === daysElapsed && done > 0 ? "every day this week" : undefined },
  ];

  // Naming a "hardest prayer" only means something once there's a pattern to
  // see. With almost nothing logged every prayer ties at zero, and whichever
  // one sorts first would get blamed for a week the user simply didn't track.
  const strongest = [...byPrayer.values()].sort((a, b) => b - a)[0] ?? 0;
  const hasPattern = done >= 5 && weakest != null && strongest - weakest[1] >= 2;

  if (hasPattern && weakest) {
    const missed = daysElapsed - weakest[1];
    metrics.push({
      label: "Hardest prayer",
      value: cap(weakest[0]),
      trend: "flat",
      note: `missed ${missed} of ${daysElapsed} day${daysElapsed === 1 ? "" : "s"}`,
    });
    signals.push({
      id: "prayer-weakest",
      kind: "slip",
      rank: 1,
      text: `${cap(weakest[0])} is the one slipping — missed ${missed} of ${daysElapsed} days. One prayer is usually where a week turns, so protect that one.`,
      href: "/app",
    });
  } else if (done === 0 && daysElapsed >= 2) {
    signals.push({
      id: "prayer-none",
      kind: "nudge",
      rank: 1,
      text: "No prayers logged this week yet. Tap the next one as you finish it — the week only needs one tap to start counting.",
      href: "/app",
    });
  }

  if (done > prevDone && prevDone > 0) {
    signals.push({ id: "prayer-up", kind: "win", rank: 3, text: `Prayers are up on last week: ${done} against ${prevDone}.` });
  }
  if (fullDays >= 3) {
    signals.push({ id: "prayer-full", kind: "win", rank: 2, text: `${fullDays} complete days of all five. That's the habit forming.` });
  }

  return {
    id: "prayers",
    title: "Salah",
    headline: done === 0 ? "Nothing logged this week yet" : `${pct(done, possible)}% of prayers logged`,
    metrics,
  };
}

/* ── habits ───────────────────────────────────────────────────── */

async function habitSection(
  from: string,
  to: string,
  prevFrom: string,
  daysElapsed: number,
  signals: Signal[],
): Promise<ReviewSection> {
  const [list, rows, prevRows] = await Promise.all([
    db.select().from(habits).where(sql`${habits.archivedAt} is null`),
    db.select().from(habitLogs).where(between(habitLogs.localDate, from, to)),
    db.select().from(habitLogs).where(between(habitLogs.localDate, prevFrom, from)),
  ]);

  const count = new Map<number, number>();
  for (const r of rows) count.set(r.habitId, (count.get(r.habitId) ?? 0) + 1);

  const metrics: Metric[] = list.map((h) => {
    const n = count.get(h.id) ?? 0;
    const target = h.cadence === "daily" ? daysElapsed : h.targetCount;
    return {
      label: h.name,
      value: `${n}/${target}`,
      trend: n >= target ? "up" : n === 0 ? "down" : "flat",
    };
  });

  const best = metrics.filter((m) => m.trend === "up");
  const missed = list.filter((h) => (count.get(h.id) ?? 0) === 0);

  if (best.length > 0) {
    signals.push({ id: "habit-win", kind: "win", rank: 4, text: `On target for ${joinList(best.map((m) => m.label))}.` });
  }
  if (missed.length > 0 && daysElapsed >= 3) {
    signals.push({
      id: "habit-cold",
      kind: "nudge",
      rank: 2,
      text: `${joinList(missed.map((h) => h.name))} ${missed.length === 1 ? "hasn't" : "haven't"} been ticked once this week. Doing one badly today still beats skipping it.`,
      href: "/app",
    });
  }

  return {
    id: "habits",
    title: "Habits",
    headline: `${rows.length} ticked this week${prevRows.length ? `, ${prevRows.length} last week` : ""}`,
    metrics,
  };
}

/* ── training ─────────────────────────────────────────────────── */

async function trainingSection(from: string, to: string, prevFrom: string, signals: Signal[]): Promise<ReviewSection> {
  const [week, prev] = await Promise.all([
    db.select().from(workouts).where(between(workouts.localDate, from, to)),
    db.select().from(workouts).where(between(workouts.localDate, prevFrom, from)),
  ]);

  const days = [...new Set(week.map((w) => weekdayLabel(w.localDate)))];

  if (week.length === 0 && prev.length > 0) {
    signals.push({
      id: "training-stopped",
      kind: "slip",
      rank: 1,
      text: `No workouts logged this week, after ${prev.length} last week. Worth getting one in before the week closes.`,
      href: "/app#training",
    });
  } else if (week.length > prev.length && week.length >= 2) {
    signals.push({ id: "training-up", kind: "win", rank: 3, text: `${week.length} sessions this week, up from ${prev.length}.` });
  }

  return {
    id: "training",
    title: "Training",
    headline: week.length === 0 ? "No sessions logged" : `${week.length} session${week.length === 1 ? "" : "s"}${days.length ? ` · ${days.join(", ")}` : ""}`,
    metrics: [
      { label: "Workouts", value: String(week.length), previous: String(prev.length), trend: trendOf(week.length, prev.length) },
    ],
  };
}

/* ── body ─────────────────────────────────────────────────────── */

async function bodySection(
  from: string,
  to: string,
  prevFrom: string,
  signals: Signal[],
  /** Prayers are on their dashboard, so a Fajr nudge means something to them. */
  prays: boolean,
): Promise<ReviewSection> {
  const avg = async (col: "steps" | "sleepMinutes", a: string, b: string) => {
    const [r] = await db
      .select({ v: sql<number | null>`avg(${bodyMetrics[col]})` })
      .from(bodyMetrics)
      .where(and(between(bodyMetrics.localDate, a, b), sql`${bodyMetrics[col]} is not null`));
    return r?.v == null ? null : Math.round(Number(r.v));
  };

  // Today's steps are still climbing, so counting them would drag the daily
  // average down and report "145 steps a day" every morning. Today's sleep is
  // last night's and already complete, so it counts. And when today is all
  // there is (someone logging by hand on day one), today's steps count too:
  // "nothing this week" beside a number they just typed reads as a bug.
  const today = localDate();
  const end = to < today ? to : today;
  const tomorrow = shiftDate(today, 1);
  const sleepEnd = to < tomorrow ? to : tomorrow;

  const [finishedSteps, prevSteps, sleep, prevSleep] = await Promise.all([
    avg("steps", from, end),
    avg("steps", prevFrom, from),
    avg("sleepMinutes", from, sleepEnd),
    avg("sleepMinutes", prevFrom, from),
  ]);
  const steps = finishedSteps ?? (end === today ? await avg("steps", from, sleepEnd) : null);

  const hhmm = (m: number | null) => (m == null ? "—" : `${Math.floor(m / 60)}h ${m % 60}m`);

  if (sleep != null && sleep < 390) {
    signals.push({
      id: "sleep-low",
      kind: "nudge",
      rank: 2,
      text: prays
        ? `Averaging ${hhmm(sleep)} a night. Fajr gets much easier at seven hours and up.`
        : `Averaging ${hhmm(sleep)} a night. Most people feel the difference at seven hours and up.`,
    });
  }

  return {
    id: "body",
    title: "Body",
    headline: steps == null && sleep == null ? (from >= today ? "The week has just started" : "Nothing logged this week") : `${steps == null ? "—" : steps.toLocaleString()} steps a day · ${hhmm(sleep)} asleep`,
    metrics: [
      { label: "Steps / day", value: steps == null ? "—" : steps.toLocaleString(), previous: prevSteps?.toLocaleString(), trend: trendOf(steps ?? 0, prevSteps ?? 0) },
      { label: "Sleep / night", value: hhmm(sleep), previous: prevSleep == null ? undefined : hhmm(prevSleep), trend: trendOf(sleep ?? 0, prevSleep ?? 0) },
    ],
  };
}

/* ── qur'an ───────────────────────────────────────────────────── */

async function quranSection(): Promise<ReviewSection | null> {
  const rows = await db.select().from(surahProgress);
  if (rows.length === 0) return null;

  const memorized = rows.filter((r) => r.status === "memorized");
  const learning = rows.filter((r) => r.status === "learning");
  const ayahs = memorized.reduce((n, r) => n + r.ayahCount, 0);

  return {
    id: "quran",
    title: "Qur'an",
    headline: `${memorized.length} of ${rows.length} surahs memorized`,
    metrics: [
      { label: "Memorized", value: `${memorized.length} surah${memorized.length === 1 ? "" : "s"}`, trend: "flat", note: `${ayahs} ayahs` },
      {
        label: "In progress",
        value: learning.length === 0 ? "none" : learning.map((r) => r.name).join(", "),
        trend: "flat",
      },
    ],
  };
}

/* ── money ────────────────────────────────────────────────────── */

async function moneySection(from: string, to: string, prevFrom: string, signals: Signal[]): Promise<ReviewSection> {
  const spent = async (a: string, b: string) => {
    const [r] = await db
      .select({ v: sql<number>`coalesce(sum(${moneyEntries.amountCents}), 0)` })
      .from(moneyEntries)
      .where(and(between(moneyEntries.occurredOn, a, b), sql`${moneyEntries.direction} = 'out'`));
    return Number(r?.v ?? 0);
  };

  const [week, prev] = await Promise.all([spent(from, to), spent(prevFrom, from)]);
  const money = (c: number) => `$${(c / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (prev > 0 && week > prev * 1.4) {
    signals.push({ id: "spend-up", kind: "nudge", rank: 5, text: `Spending is ${Math.round(((week - prev) / prev) * 100)}% above last week.` });
  }

  return {
    id: "money",
    title: "Money",
    headline: week === 0 ? "Nothing spent this week" : `${money(week)} out`,
    // Spending less is the better direction here.
    metrics: [{ label: "Spent", value: money(week), previous: money(prev), trend: trendOf(week, prev, false) }],
  };
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "a, b and c", and "a, b and 3 more" past the cap — never "a and b and c". */
function joinList(items: string[], max = 3): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  const tail = rest > 0 ? `${rest} more` : shown.pop()!;
  return `${shown.join(", ")} and ${tail}`;
}

/** Flattened for the Rafiq tool, so the model gets figures rather than prose. */
export async function weeklyReviewSummary() {
  const r = await buildWeeklyReview();
  return {
    week_of: r.weekStart,
    week_still_running: r.partial,
    days_elapsed: r.daysElapsed,
    sections: r.sections.map((s) => ({
      area: s.title,
      headline: s.headline,
      metrics: s.metrics.map((m) => ({
        label: m.label,
        value: m.value,
        last_week: m.previous ?? null,
        direction: m.trend,
        note: m.note ?? null,
      })),
    })),
    things_worth_saying: r.signals.map((s) => ({ kind: s.kind, text: s.text })),
    note: "These figures come from the user's own logged data. Use them as given; never adjust or invent a number.",
  };
}
