"use server";

import { revalidatePath } from "next/cache";
import { loadTraining, logWorkout, deleteWorkout, type TrainingData } from ".";
import {
  loadRoutines,
  createRoutine,
  updateRoutine,
  archiveRoutine,
  type RoutineInput,
  type RoutineRow,
} from "./routines";
import type { MuscleGroup } from "./muscles";
import { syncHevy } from "./hevy";

/**
 * The server boundary for the training section. Mirrors lib/widgets/actions.ts
 * — the logic stays in the module that owns the data, this file just marks
 * the boundary and revalidates.
 */

export async function loadTrainingAction(date: string): Promise<TrainingData> {
  return loadTraining(date);
}

/** The "Sync now" button: pull from Hevy immediately, skipping the 30-minute
    throttle, then hand back the refreshed section. */
export async function syncHevyNowAction(date: string): Promise<TrainingData> {
  try {
    await syncHevy();
  } catch {
    // The error is recorded in sync_state and shows in the header.
  }
  revalidatePath("/app");
  return loadTraining(date);
}

export async function logWorkoutAction(input: {
  localDate: string;
  title: string;
  exercises: {
    name: string;
    muscleGroup: MuscleGroup;
    sets?: number | null;
    reps?: number | null;
    loadGrams?: number | null;
  }[];
}) {
  const r = await logWorkout(input, "ui");
  revalidatePath("/app");
  return r;
}

export async function deleteWorkoutAction(id: number) {
  const r = await deleteWorkout(id);
  revalidatePath("/app");
  return r;
}

/* ── routines ───────────────────────────────────────────────── */

export async function loadRoutinesAction(): Promise<RoutineRow[]> {
  return loadRoutines();
}

export async function createRoutineAction(input: RoutineInput) {
  const r = await createRoutine(input);
  revalidatePath("/app");
  return r;
}

export async function updateRoutineAction(id: number, input: RoutineInput) {
  const r = await updateRoutine(id, input);
  revalidatePath("/app");
  return r;
}

export async function archiveRoutineAction(id: number) {
  const r = await archiveRoutine(id);
  revalidatePath("/app");
  return r;
}

/**
 * Turns a routine into a logged session for `date`. Planned rep ranges collapse
 * to the low end — the floor you committed to, which you then correct upward
 * in the workout list if the session actually went better.
 */
export async function logRoutineAction(routineId: number, date: string) {
  const routine = (await loadRoutines()).find((r) => r.id === routineId);
  if (!routine) return { ok: false as const, error: "Routine not found." };

  const r = await logWorkout(
    {
      localDate: date,
      title: routine.name,
      exercises: routine.exercises
        .filter((e) => e.muscleGroup != null)
        .map((e) => ({
          name: e.name,
          muscleGroup: e.muscleGroup as MuscleGroup,
          sets: e.sets,
          reps: e.repLow,
          loadGrams: null,
        })),
    },
    "ui",
  );
  revalidatePath("/app");
  return r;
}
