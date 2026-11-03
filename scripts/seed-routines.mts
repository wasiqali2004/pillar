/**
 * Seeds the three routines exported from Hevy. Idempotent by routine name —
 * re-running skips any routine that already exists rather than duplicating it,
 * so this is safe to run after editing routines in the UI.
 *
 *   npm run seed:routines
 *
 * Raw SQL rather than drizzle: schema.ts imports through the "@/" alias, which
 * plain Node can't resolve, and this script isn't worth a bundler for.
 */
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.DATABASE_URL! });

/** [name, muscleGroup | null, sets, repLow | null, repHigh | null] */
type Ex = [string, string | null, number | null, number | null, number | null];

const ROUTINES: {
  name: string;
  splitLabel: string;
  estimatedMinutes: number;
  exercises: Ex[];
}[] = [
  {
    name: "Chest and Bicep",
    splitLabel: "Push",
    estimatedMinutes: 46,
    exercises: [
      ["Incline Bench Press (Smith Machine)", "chest", 3, 5, 6],
      ["Behind the Back Curl (Cable)", "biceps", 3, 5, 8],
      ["Seated Chest Flys (Cable)", "chest", 4, 7, 10],
      ["Hammer Curl (Cable)", "biceps", 3, 4, 7],
      ["Chest Press (Machine)", "chest", 4, 5, 6],
      ["EZ Bar Biceps Curl", "biceps", 2, 7, 8],
      ["Push Up", "chest", 2, 25, 36],
      ["Clap Push Ups", "chest", 1, null, null],
      ["Incline Chest Press (Machine)", "chest", 2, 8, 8],
      ["Preacher Curl (Machine)", "biceps", 3, 4, 6],
      ["Butterfly (Pec Deck)", "chest", 3, 4, 5],
      ["Low Cable Fly Crossovers", "chest", 3, 6, 9],
      ["Hammer Curl (Cable)", "biceps", 4, 6, 10],
      ["Hammer Curl (Dumbbell)", "biceps", 4, 6, 8],
      ["Cable Fly Crossovers", "chest", 1, 8, 8],
      ["Iso-Lateral Chest Press (Machine)", "chest", 3, 6, 10],
      ["Treadmill", null, 1, null, null],
      ["Incline Bench Press (Dumbbell)", "chest", 3, 7, 10],
    ],
  },
  {
    name: "Back and Tricep",
    splitLabel: "Pull",
    estimatedMinutes: 43,
    exercises: [
      ["Lat Pulldown (Cable)", "lats", 3, 5, 9],
      ["Triceps Rope Pushdown", "triceps", 6, 5, 8],
      ["Single Arm Cable Row", "lats", 8, 3, 8],
      ["Triceps Dip (Weighted)", "triceps", 2, 3, 6],
      ["Triceps Pressdown", "triceps", 5, 6, 10],
      ["Pull Up", "lats", 2, 9, 10],
      ["Lat Pulldown (Machine)", "lats", 3, 7, 8],
      ["Treadmill", null, 1, null, null],
      ["Triceps Dip", "triceps", 2, 14, 15],
      ["Iso-Lateral High Row (Machine)", "traps", 6, 6, 7],
    ],
  },
  {
    name: "Legs + Shoulders",
    splitLabel: "Legs",
    estimatedMinutes: 46,
    exercises: [
      ["Shoulder Press (Machine Plates)", "shoulders", 3, 6, 8],
      ["Leg Press Horizontal (Machine)", "quads", 3, 4, 8],
      ["Lateral Raise (Cable)", "shoulders", 8, 4, 15],
      ["Leg Extension (Machine)", "quads", 5, 6, 9],
      ["Rear Delt Reverse Fly (Cable)", "shoulders", 3, 4, 8],
      ["Crunch (Weighted)", "abs", 2, 10, 10],
      ["Leg Raise Parallel Bars", "abs", 2, 10, 10],
      ["Treadmill", null, 1, null, null],
      ["Seated Shoulder Press (Machine)", "shoulders", 3, 4, 7],
      ["Seated Leg Curl (Machine)", "hamstrings", 3, 6, 6],
      ["Lateral Raise (Dumbbell)", "shoulders", 3, 12, 15],
      ["Seated Shoulder Press (Machine)", "shoulders", 2, 4, 8],
      ["Shoulder Press (Dumbbell)", "shoulders", 2, 4, 5],
      ["Shrug (Cable)", "traps", 2, 8, 10],
    ],
  },
];

const found = await db.execute("select name from routines");
const existing = new Set(found.rows.map((r) => String(r.name)));

let created = 0;
for (const [i, r] of ROUTINES.entries()) {
  if (existing.has(r.name)) {
    console.log(`· ${r.name} — already present, skipped`);
    continue;
  }

  const ins = await db.execute({
    sql: `insert into routines (name, split_label, estimated_minutes, sort_order, created_at)
          values (?, ?, ?, ?, ?)`,
    args: [r.name, r.splitLabel, r.estimatedMinutes, i, new Date().toISOString()],
  });
  const routineId = Number(ins.lastInsertRowid);

  for (const [j, [name, muscleGroup, sets, repLow, repHigh]] of r.exercises.entries()) {
    await db.execute({
      sql: `insert into routine_exercises
              (routine_id, name, muscle_group, sets, rep_low, rep_high, sort_order)
            values (?, ?, ?, ?, ?, ?, ?)`,
      args: [routineId, name, muscleGroup, sets, repLow, repHigh, j],
    });
  }

  const totalSets = r.exercises.reduce((n, e) => n + (e[2] ?? 0), 0);
  console.log(`✓ ${r.name} — ${r.exercises.length} exercises, ${totalSets} sets`);
  created++;
}

console.log(created === 0 ? "\nNothing to do." : `\n${created} routine(s) seeded.`);
