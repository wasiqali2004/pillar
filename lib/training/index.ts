import "server-only";
import { eq, inArray, desc, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { workouts, workoutExercises, auditLog } from "@/lib/db/schema";
import { MUSCLE_GROUPS, type MuscleGroup } from "./muscles";
import { localDate, shiftDate } from "@/lib/date";
import { syncHevyIfStale, hevyStatus } from "./hevy";
import { loadProgress, type Progress } from "./progress";

export type ExerciseRow = {
  id: number;
  name: string;
  muscleGroup: MuscleGroup;
  sets: number | null;
  reps: number | null;
  loadGrams: number | null;
};

export type WorkoutRow = {
  id: number;
  localDate: string;
  title: string;
  notes: string | null;
  /** Where it came from: "hevy" ones come back on the next sync unless deleted there. */
  source: string;
  exercises: ExerciseRow[];
};

export type TrainingData = {
  /** The day being shown. Defaults to yesterday — the last completed session. */
  date: string;
  /** Whether `date` is today, yesterday, or further back. Drives the label. */
  label: string;
  workouts: WorkoutRow[];
  /** Every muscle hit on `date`, for the body map to light up. */
  worked: MuscleGroup[];
  /**
   * Days since each muscle was last trained, across the trailing 14 days.
   * Missing key = not trained in that window. Drives the recovery readout.
   */
  daysSince: Partial<Record<MuscleGroup, number>>;
  /** Dates in the last 14 days that have at least one workout, for the strip. */
  activeDates: string[];
  /** Where the Hevy sync stands, for the header. */
  hevy: { configured: boolean; lastSyncAt: string | null; lastError: string | null };
  /** Streaks, weekly goal, PRs, calendar — the section's scoreboard. */
  progress: Progress;
};

function relativeLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === shiftDate(today, -1)) return "Yesterday";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function hydrate(rows: (typeof workouts.$inferSelect)[]): Promise<WorkoutRow[]> {
  if (rows.length === 0) return [];
  const exercises = await db
    .select()
    .from(workoutExercises)
    .where(
      inArray(
        workoutExercises.workoutId,
        rows.map((w) => w.id),
      ),
    )
    .orderBy(workoutExercises.sortOrder, workoutExercises.id);

  return rows.map((w) => ({
    id: w.id,
    localDate: w.localDate,
    title: w.title,
    notes: w.notes,
    source: w.source,
    exercises: exercises
      .filter((e) => e.workoutId === w.id)
      .map((e) => ({
        id: e.id,
        name: e.name,
        muscleGroup: e.muscleGroup,
        sets: e.sets,
        reps: e.reps,
        loadGrams: e.loadGrams,
      })),
  }));
}

/**
 * @param date  Which day to show. Defaults to yesterday, because that's the
 *              session you've actually finished — "what did I hit" is a
 *              question about the last completed workout, not a half-done one.
 */
export async function loadTraining(date?: string): Promise<TrainingData> {
  // Pulls new, edited and deleted sessions from Hevy if the last pull is over
  // 30 minutes old. Throttled and non-throwing.
  await syncHevyIfStale();

  const today = localDate();
  // Open on today once today has a session (Hevy syncs it within the half
  // hour); until then, yesterday — the last completed one.
  const trainedToday =
    date == null &&
    (await db.select({ id: workouts.id }).from(workouts).where(eq(workouts.localDate, today)).limit(1))
      .length > 0;
  const target = date ?? (trainedToday ? today : shiftDate(today, -1));

  const [dayRows, windowRows] = await Promise.all([
    db.select().from(workouts).where(eq(workouts.localDate, target)),
    db
      .select()
      .from(workouts)
      .where(gte(workouts.localDate, shiftDate(today, -14)))
      .orderBy(desc(workouts.localDate)),
  ]);

  const dayWorkouts = await hydrate(dayRows);

  const worked = [
    ...new Set(dayWorkouts.flatMap((w) => w.exercises.map((e) => e.muscleGroup))),
  ].sort((a, b) => MUSCLE_GROUPS.indexOf(a) - MUSCLE_GROUPS.indexOf(b));

  // Recovery: how long since each muscle was last touched. Walks the 14-day
  // window newest-first and keeps the first hit per muscle.
  const windowWorkouts = await hydrate(windowRows);
  const daysSince: Partial<Record<MuscleGroup, number>> = {};
  for (const w of windowWorkouts) {
    const gap = Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${w.localDate}T00:00:00Z`)) /
        86_400_000,
    );
    for (const e of w.exercises) {
      const prev = daysSince[e.muscleGroup];
      if (prev == null || gap < prev) daysSince[e.muscleGroup] = gap;
    }
  }

  return {
    date: target,
    label: relativeLabel(target, today),
    workouts: dayWorkouts,
    worked,
    daysSince,
    activeDates: [...new Set(windowWorkouts.map((w) => w.localDate))],
    hevy: await hevyStatus(),
    progress: await loadProgress(target),
  };
}

export async function logWorkout(
  input: {
    localDate?: string;
    title: string;
    notes?: string | null;
    exercises: {
      name: string;
      muscleGroup: MuscleGroup;
      sets?: number | null;
      reps?: number | null;
      loadGrams?: number | null;
    }[];
  },
  source: "ui" | "rafiq" = "ui",
) {
  const title = input.title.trim();
  if (!title) return { ok: false as const, error: "A workout needs a title." };
  if (input.exercises.length === 0) {
    return { ok: false as const, error: "Add at least one exercise." };
  }
  const bad = input.exercises.find(
    (e) => !MUSCLE_GROUPS.includes(e.muscleGroup),
  );
  if (bad) {
    return { ok: false as const, error: `Unknown muscle group: ${bad.muscleGroup}` };
  }

  const day = input.localDate ?? localDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > localDate()) {
    return { ok: false as const, error: "Pick today or an earlier day." };
  }
  const [row] = await db
    .insert(workouts)
    .values({ localDate: day, title, notes: input.notes ?? null, source })
    .returning({ id: workouts.id });

  await db.insert(workoutExercises).values(
    input.exercises.map((e, i) => ({
      workoutId: row.id,
      name: e.name.trim() || e.muscleGroup,
      muscleGroup: e.muscleGroup,
      sets: e.sets ?? null,
      reps: e.reps ?? null,
      loadGrams: e.loadGrams ?? null,
      sortOrder: i,
    })),
  );

  await db.insert(auditLog).values({
    actor: source === "rafiq" ? "rafiq" : "user",
    action: "training.log",
    tableName: "workouts",
    rowId: row.id,
    payload: { localDate: day, title, exercises: input.exercises.length },
  });

  return { ok: true as const, id: row.id };
}

export async function deleteWorkout(id: number) {
  // Exercises cascade from the FK, so this is the whole session.
  await db.delete(workouts).where(eq(workouts.id, id));
  await db.insert(auditLog).values({
    actor: "user",
    action: "training.delete",
    tableName: "workouts",
    rowId: id,
    payload: { id },
  });
  return { ok: true as const };
}

export async function trainingSummary(date?: string) {
  const d = await loadTraining(date);
  return {
    date: d.date,
    workouts: d.workouts.map((w) => ({
      title: w.title,
      exercises: w.exercises.map((e) => ({
        name: e.name,
        muscle_group: e.muscleGroup,
        sets: e.sets,
        reps: e.reps,
        load_kg: e.loadGrams == null ? null : e.loadGrams / 1000,
      })),
    })),
    muscles_worked: d.worked,
    days_since_last_trained: d.daysSince,
  };
}

/** Folded into allTools() by the registry — see the note there. */
export const trainingTools = [
  {
    name: "get_training",
    description:
      "Workouts and the muscle groups they hit for a given day (defaults to yesterday), plus days since each muscle group was last trained.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Omit for yesterday." },
      },
    },
    handler: (input: { date?: string }) => trainingSummary(input?.date),
  },
  {
    name: "log_workout",
    description:
      "Record a workout session and the exercises in it. Each exercise must name one muscle group from: " +
      MUSCLE_GROUPS.join(", ") +
      ". Load is in grams.",
    input_schema: {
      type: "object" as const,
      properties: {
        localDate: { type: "string", description: "YYYY-MM-DD. Omit for today." },
        title: { type: "string" },
        notes: { type: "string" },
        exercises: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              muscleGroup: { type: "string", enum: MUSCLE_GROUPS },
              sets: { type: "number" },
              reps: { type: "number" },
              loadGrams: { type: "number" },
            },
            required: ["name", "muscleGroup"],
          },
        },
      },
      required: ["title", "exercises"],
    },
    write: true,
    handler: (input: Parameters<typeof logWorkout>[0]) => logWorkout(input, "rafiq"),
  },
];
