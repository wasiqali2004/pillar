import "server-only";
import { asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { routines, routineExercises, auditLog } from "@/lib/db/schema";
import { MUSCLE_GROUPS, type MuscleGroup } from "./muscles";

export type RoutineExerciseRow = {
  id: number;
  name: string;
  muscleGroup: MuscleGroup | null;
  sets: number | null;
  repLow: number | null;
  repHigh: number | null;
};

export type RoutineRow = {
  id: number;
  name: string;
  splitLabel: string | null;
  notes: string | null;
  estimatedMinutes: number | null;
  exercises: RoutineExerciseRow[];
  /** Derived, never stored — a stored total drifts the moment a set changes. */
  totalSets: number;
  /** Sets per primary muscle group, biggest first. */
  byMuscle: { muscle: MuscleGroup; sets: number }[];
};

function summarize(exercises: RoutineExerciseRow[]) {
  const tally = new Map<MuscleGroup, number>();
  let totalSets = 0;
  for (const e of exercises) {
    const s = e.sets ?? 0;
    totalSets += s;
    if (e.muscleGroup) {
      tally.set(e.muscleGroup, (tally.get(e.muscleGroup) ?? 0) + s);
    }
  }
  const byMuscle = [...tally.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
  return { totalSets, byMuscle };
}

export async function loadRoutines(): Promise<RoutineRow[]> {
  const rows = await db
    .select()
    .from(routines)
    .where(isNull(routines.archivedAt))
    .orderBy(asc(routines.sortOrder), asc(routines.id));

  if (rows.length === 0) return [];

  const exercises = await db
    .select()
    .from(routineExercises)
    .orderBy(asc(routineExercises.sortOrder), asc(routineExercises.id));

  return rows.map((r) => {
    const mine: RoutineExerciseRow[] = exercises
      .filter((e) => e.routineId === r.id)
      .map((e) => ({
        id: e.id,
        name: e.name,
        muscleGroup: e.muscleGroup,
        sets: e.sets,
        repLow: e.repLow,
        repHigh: e.repHigh,
      }));

    return {
      id: r.id,
      name: r.name,
      splitLabel: r.splitLabel,
      notes: r.notes,
      estimatedMinutes: r.estimatedMinutes,
      exercises: mine,
      ...summarize(mine),
    };
  });
}

export type RoutineInput = {
  name: string;
  splitLabel?: string | null;
  notes?: string | null;
  estimatedMinutes?: number | null;
  exercises: {
    name: string;
    muscleGroup: MuscleGroup | null;
    sets?: number | null;
    repLow?: number | null;
    repHigh?: number | null;
  }[];
};

function validate(input: RoutineInput): string | null {
  if (!input.name.trim()) return "A routine needs a name.";
  if (input.exercises.length === 0) return "Add at least one exercise.";
  const bad = input.exercises.find(
    (e) => e.muscleGroup != null && !MUSCLE_GROUPS.includes(e.muscleGroup),
  );
  if (bad) return `Unknown muscle group: ${bad.muscleGroup}`;
  return null;
}

async function writeExercises(routineId: number, input: RoutineInput) {
  await db
    .delete(routineExercises)
    .where(eq(routineExercises.routineId, routineId));

  const rows = input.exercises
    .filter((e) => e.name.trim() !== "")
    .map((e, i) => ({
      routineId,
      name: e.name.trim(),
      muscleGroup: e.muscleGroup,
      sets: e.sets ?? null,
      repLow: e.repLow ?? null,
      repHigh: e.repHigh ?? null,
      sortOrder: i,
    }));

  if (rows.length > 0) await db.insert(routineExercises).values(rows);
}

export async function createRoutine(input: RoutineInput) {
  const err = validate(input);
  if (err) return { ok: false as const, error: err };

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${routines.sortOrder}), -1)` })
    .from(routines);

  const [row] = await db
    .insert(routines)
    .values({
      name: input.name.trim(),
      splitLabel: input.splitLabel ?? null,
      notes: input.notes ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      sortOrder: Number(max) + 1,
    })
    .returning({ id: routines.id });

  await writeExercises(row.id, input);

  await db.insert(auditLog).values({
    actor: "user",
    action: "routine.create",
    tableName: "routines",
    rowId: row.id,
    payload: { name: input.name, exercises: input.exercises.length },
  });

  return { ok: true as const, id: row.id };
}

/** Replaces the routine wholesale — the editor always submits the full list. */
export async function updateRoutine(id: number, input: RoutineInput) {
  const err = validate(input);
  if (err) return { ok: false as const, error: err };

  await db
    .update(routines)
    .set({
      name: input.name.trim(),
      splitLabel: input.splitLabel ?? null,
      notes: input.notes ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
    })
    .where(eq(routines.id, id));

  await writeExercises(id, input);

  await db.insert(auditLog).values({
    actor: "user",
    action: "routine.update",
    tableName: "routines",
    rowId: id,
    payload: { name: input.name, exercises: input.exercises.length },
  });

  return { ok: true as const, id };
}

/**
 * Archive rather than delete: a routine is referenced by every session logged
 * from it in conversation, and a hard delete would strand that history.
 */
export async function archiveRoutine(id: number) {
  await db
    .update(routines)
    .set({ archivedAt: new Date().toISOString() })
    .where(eq(routines.id, id));

  await db.insert(auditLog).values({
    actor: "user",
    action: "routine.archive",
    tableName: "routines",
    rowId: id,
    payload: { id },
  });

  return { ok: true as const };
}

export async function routinesSummary() {
  const rows = await loadRoutines();
  return rows.map((r) => ({
    name: r.name,
    split: r.splitLabel,
    exercises: r.exercises.length,
    total_sets: r.totalSets,
    estimated_minutes: r.estimatedMinutes,
    sets_by_muscle: Object.fromEntries(
      r.byMuscle.map((m) => [m.muscle, m.sets]),
    ),
    movements: r.exercises.map((e) => ({
      name: e.name,
      muscle_group: e.muscleGroup,
      sets: e.sets,
      rep_range:
        e.repLow == null
          ? null
          : e.repHigh == null || e.repHigh === e.repLow
            ? String(e.repLow)
            : `${e.repLow}-${e.repHigh}`,
    })),
  }));
}

export const routineTools = [
  {
    name: "get_routines",
    description:
      "The saved workout routines (templates): every exercise, its planned sets and rep range, and total sets per muscle group.",
    input_schema: { type: "object" as const, properties: {} },
    handler: routinesSummary,
  },
];
