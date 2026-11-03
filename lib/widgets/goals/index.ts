import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { defineWidget } from "../types";
import { GoalsTile } from "./GoalsTile";
import { db } from "@/lib/db";
import {
  goals,
  businessRevenue,
  moneyEntries,
  workouts,
  surahProgress,
  prayerLogs,
  bodyMetrics,
  habitLogs,
  type Goal,
} from "@/lib/db/schema";
import {
  localDate,
  startOfWeek,
  startOfMonth,
  startOfYear,
  dayOfMonth,
  daysInMonth,
} from "@/lib/date";

export type GoalRow = {
  id: number;
  title: string;
  metric: Goal["metric"];
  unit: string | null;
  period: Goal["period"];
  direction: Goal["direction"];
  target: number;
  current: number;
  pct: number;
  onTrack: boolean;
  /** null for "once" goals, which have no pace. */
  pacePct: number | null;
  isMoney: boolean;
};

export type GoalsData = { rows: GoalRow[]; today: string };

const MONEY_METRICS = new Set(["business_revenue", "income", "spend"]);

function periodStart(period: Goal["period"], today: string): string {
  if (period === "week") return startOfWeek(today);
  if (period === "month") return startOfMonth(today);
  if (period === "year") return startOfYear(today);
  return "1970-01-01";
}

/**
 * How far through the period we are, 0–100. A $5k month is "on track" at day 15
 * with $2.5k, not just at $5k on day 30 — this is what makes that distinction.
 */
function periodElapsedPct(period: Goal["period"], today: string): number | null {
  if (period === "once") return null;
  if (period === "month") return (dayOfMonth(today) / daysInMonth(today)) * 100;
  if (period === "week") {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    return ((dow + 1) / 7) * 100;
  }
  const start = Date.parse(`${startOfYear(today)}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  const days = Math.round((now - start) / 86_400_000) + 1;
  const total = new Date(Date.UTC(Number(today.slice(0, 4)), 11, 31)).getUTCDate() === 31
    ? (Number(today.slice(0, 4)) % 4 === 0 ? 366 : 365)
    : 365;
  return (days / total) * 100;
}

async function currentValue(goal: Goal, since: string): Promise<number> {
  const one = async (q: Promise<{ v: unknown }[]>) =>
    Number((await q)[0]?.v ?? 0);

  switch (goal.metric) {
    case "business_revenue":
      return one(
        db
          .select({ v: sql`coalesce(sum(${businessRevenue.revenueCents}), 0)` })
          .from(businessRevenue)
          .where(gte(businessRevenue.localDate, since)),
      );

    case "income":
    case "spend":
      return one(
        db
          .select({ v: sql`coalesce(sum(${moneyEntries.amountCents}), 0)` })
          .from(moneyEntries)
          .where(
            and(
              eq(moneyEntries.direction, goal.metric === "income" ? "in" : "out"),
              gte(moneyEntries.occurredOn, since),
            ),
          ),
      );

    case "workouts":
      return one(
        db
          .select({ v: sql`count(*)` })
          .from(workouts)
          .where(gte(workouts.localDate, since)),
      );

    case "surahs_memorized":
      // updatedAt is when the status last changed, so it dates the memorization.
      return one(
        db
          .select({ v: sql`count(*)` })
          .from(surahProgress)
          .where(
            and(
              eq(surahProgress.status, "memorized"),
              gte(surahProgress.updatedAt, since),
            ),
          ),
      );

    case "prayers":
      return one(
        db
          .select({ v: sql`count(*)` })
          .from(prayerLogs)
          .where(gte(prayerLogs.localDate, since)),
      );

    case "steps_avg":
      return one(
        db
          .select({ v: sql`coalesce(round(avg(${bodyMetrics.steps})), 0)` })
          .from(bodyMetrics)
          .where(gte(bodyMetrics.localDate, since)),
      );

    case "weight":
      return one(
        db
          .select({ v: sql`coalesce(${bodyMetrics.weightGrams}, 0)` })
          .from(bodyMetrics)
          .where(sql`${bodyMetrics.weightGrams} is not null`)
          .orderBy(sql`${bodyMetrics.localDate} desc`)
          .limit(1),
      );

    case "habit_rate":
      return one(
        db
          .select({ v: sql`count(*)` })
          .from(habitLogs)
          .where(gte(habitLogs.localDate, since)),
      );

    default:
      return goal.manualProgress;
  }
}

export async function loadGoals(): Promise<GoalsData> {
  const today = localDate();
  const rows = await db
    .select()
    .from(goals)
    .where(eq(goals.active, true))
    .orderBy(goals.sortOrder);

  const resolved = await Promise.all(
    rows.map(async (g): Promise<GoalRow> => {
      const current = await currentValue(g, periodStart(g.period, today));
      const atMost = g.direction === "at_most";

      // For at_most goals, "progress" is consumption of an allowance.
      const raw = g.targetValue === 0 ? 0 : (current / g.targetValue) * 100;
      const pace = periodElapsedPct(g.period, today);

      const onTrack = atMost
        ? pace == null
          ? current <= g.targetValue
          : raw <= pace
        : pace == null
          ? current >= g.targetValue
          : raw >= pace;

      return {
        id: g.id,
        title: g.title,
        metric: g.metric,
        unit: g.unit,
        period: g.period,
        direction: g.direction,
        target: g.targetValue,
        current,
        pct: Math.min(100, Math.max(0, raw)),
        onTrack,
        pacePct: pace,
        isMoney: MONEY_METRICS.has(g.metric),
      };
    }),
  );

  return { rows: resolved, today };
}

export async function goalsSummary() {
  const d = await loadGoals();
  return {
    goals: d.rows.map((g) => ({
      title: g.title,
      period: g.period,
      target: g.target,
      current: g.current,
      percent: Number(g.pct.toFixed(1)),
      on_track: g.onTrack,
      is_money_in_cents: g.isMoney,
    })),
  };
}

export const goalsWidget = defineWidget<GoalsData>({
  id: "goals",
  title: "Goals",
  span: 6,
  size: "sm",
  refresh: "live",
  load: loadGoals,
  Tile: GoalsTile,
  tools: [
    {
      name: "get_goals",
      description:
        "Active goals with current progress, target, percent complete, and whether each is on pace for its period. Money values are in cents.",
      input_schema: { type: "object", properties: {} },
      handler: goalsSummary,
    },
  ],
});
