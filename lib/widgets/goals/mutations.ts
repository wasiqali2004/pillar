import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { goals, auditLog, type Goal } from "@/lib/db/schema";

async function recordAudit(
  actor: "ui" | "rafiq",
  action: string,
  rowId: number,
  payload: unknown,
) {
  await db.insert(auditLog).values({
    actor: actor === "rafiq" ? "rafiq" : "user",
    action,
    tableName: "goals",
    rowId,
    payload,
  });
}

export async function createGoal(input: {
  title: string;
  metric: Goal["metric"];
  targetValue: number;
  unit?: string | null;
  period?: Goal["period"];
  direction?: Goal["direction"];
}) {
  if (!input.title || input.title.trim() === "") {
    return { ok: false, error: "Goal title is required." };
  }
  if (!(Number.isFinite(input.targetValue) && input.targetValue > 0)) {
    return { ok: false, error: "Target must be a number above zero." };
  }

  const result = await db
    .insert(goals)
    .values({
      title: input.title.trim(),
      metric: input.metric,
      targetValue: input.targetValue,
      unit: input.unit ?? null,
      period: input.period ?? "month",
      direction: input.direction ?? "at_least",
      active: true,
      sortOrder: 0,
    })
    .returning();

  await recordAudit("ui", "goal.create", result[0].id, result[0]);
  return { ok: true, id: result[0].id };
}

export async function updateGoal(
  goalId: number,
  input: {
    title?: string;
    metric?: Goal["metric"];
    targetValue?: number;
    unit?: string | null;
    period?: Goal["period"];
    direction?: Goal["direction"];
  },
) {
  if (input.title !== undefined && input.title.trim() === "") {
    return { ok: false, error: "Goal title is required." };
  }
  if (
    input.targetValue !== undefined &&
    !(Number.isFinite(input.targetValue) && input.targetValue > 0)
  ) {
    return { ok: false, error: "Target must be a number above zero." };
  }

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.metric !== undefined) patch.metric = input.metric;
  if (input.targetValue !== undefined) patch.targetValue = input.targetValue;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.period !== undefined) patch.period = input.period;
  if (input.direction !== undefined) patch.direction = input.direction;

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  await db.update(goals).set(patch).where(eq(goals.id, goalId));
  await recordAudit("ui", "goal.update", goalId, patch);
  return { ok: true };
}

/** Counts a hand-tracked ("custom") goal up or down by one. Never below zero. */
export async function stepGoal(goalId: number, delta: 1 | -1) {
  const [g] = await db.select().from(goals).where(eq(goals.id, goalId));
  if (!g || g.metric !== "custom") return { ok: false, error: "Only your own goals are counted by hand." };
  const manualProgress = Math.max(0, g.manualProgress + delta);
  await db.update(goals).set({ manualProgress }).where(eq(goals.id, goalId));
  await recordAudit("ui", "goal.step", goalId, { delta, manualProgress });
  return { ok: true };
}

export async function deleteGoal(goalId: number) {
  await db.update(goals).set({ active: false }).where(eq(goals.id, goalId));
  await recordAudit("ui", "goal.delete", goalId, { goalId });
  return { ok: true };
}
