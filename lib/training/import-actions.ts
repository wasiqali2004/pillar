"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, workoutExercises, workouts } from "@/lib/db/schema";
import { localDate } from "@/lib/date";
import { MUSCLE_GROUPS } from "./muscles";
import { MAX_WORKOUTS, type ImportedWorkout } from "./import";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (n: unknown, max: number) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : null;

/**
 * Saves workouts read from an app's export in the browser.
 *
 * Each one is keyed by the file's own date-and-name (`externalId`), so
 * uploading the same export again, or a newer one that overlaps, replaces
 * those sessions instead of doubling them.
 */
export async function importWorkoutsAction(
  list: ImportedWorkout[],
): Promise<{ ok: true; added: number; updated: number; from: string; to: string } | { ok: false; error: string }> {
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: "Nothing to import." };
  if (list.length > MAX_WORKOUTS) return { ok: false, error: `Upload ${MAX_WORKOUTS} workouts or fewer at a time.` };

  const today = localDate();
  const clean = list.filter(
    (w) =>
      typeof w?.key === "string" &&
      w.key.startsWith("file:") &&
      w.key.length <= 200 &&
      DATE.test(w.localDate) &&
      w.localDate >= "2000-01-01" &&
      w.localDate <= today &&
      typeof w.title === "string" &&
      Array.isArray(w.exercises),
  );
  if (clean.length === 0) return { ok: false, error: "None of those workouts had a usable date." };

  let added = 0;
  let updated = 0;
  for (const w of clean) {
    const row = {
      localDate: w.localDate,
      title: w.title.trim().slice(0, 80) || "Workout",
      notes: null,
      source: "import" as const,
      externalId: w.key,
    };
    const [existing] = await db.select({ id: workouts.id }).from(workouts).where(eq(workouts.externalId, w.key));
    let id: number;
    if (existing) {
      id = existing.id;
      await db.update(workouts).set(row).where(eq(workouts.id, id));
      await db.delete(workoutExercises).where(eq(workoutExercises.workoutId, id));
      updated++;
    } else {
      [{ id }] = await db.insert(workouts).values(row).returning({ id: workouts.id });
      added++;
    }

    const exercises = w.exercises
      .slice(0, 60)
      .filter((e) => typeof e?.name === "string" && e.name.trim() && MUSCLE_GROUPS.includes(e.muscleGroup))
      .map((e, i) => ({
        workoutId: id,
        name: e.name.trim().slice(0, 80),
        muscleGroup: e.muscleGroup,
        sets: int(e.sets, 100),
        reps: int(e.reps, 1000),
        loadGrams: int(e.loadGrams, 1_000_000),
        sortOrder: i,
      }));
    if (exercises.length) await db.insert(workoutExercises).values(exercises);
  }

  const dates = clean.map((w) => w.localDate).sort();
  await db.insert(auditLog).values({
    actor: "user",
    action: "training.import_export",
    tableName: "workouts",
    payload: { added, updated, from: dates[0], to: dates.at(-1) },
  });

  revalidatePath("/app");
  return { ok: true, added, updated, from: dates[0], to: dates.at(-1)! };
}
