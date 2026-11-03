/**
 * The muscle vocabulary, kept free of server imports on purpose: the DB schema
 * and the client-side body map both need this list, and pulling schema.ts into
 * a "use client" component would drag drizzle into the browser bundle.
 */

export const MUSCLE_GROUPS = [
  "chest",
  "lats",
  "traps",
  "lower_back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  lats: "Lats",
  traps: "Traps",
  lower_back: "Lower back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
};

/** Which view each muscle is drawn on, so the map can auto-turn to show it. */
export const MUSCLE_VIEW: Record<MuscleGroup, "front" | "back" | "both"> = {
  chest: "front",
  abs: "front",
  obliques: "front",
  biceps: "front",
  quads: "front",
  lats: "back",
  lower_back: "back",
  triceps: "back",
  glutes: "back",
  hamstrings: "back",
  traps: "both",
  shoulders: "both",
  forearms: "both",
  calves: "both",
};
