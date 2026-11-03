/**
 * Reads a workout app's export into Training sessions, in the browser, so only
 * the workouts themselves are sent to the server.
 *
 * Two shapes, told apart by their columns:
 *   Strength (one row per set): Strong, Hevy, Fitbod, and most gym apps.
 *     Date, workout name, exercise, weight, reps, and sometimes a warm-up flag.
 *   Cardio (one row per activity): Strava's activities.csv, Peloton, Garmin.
 *     Date, activity type, name, and distance or duration.
 *
 * Client-safe: no server imports, so the upload component can use it.
 */

import type { MuscleGroup } from "./muscles";

export type ImportedExercise = {
  name: string;
  muscleGroup: MuscleGroup;
  sets: number | null;
  reps: number | null;
  loadGrams: number | null;
};

export type ImportedWorkout = {
  /** Stable across re-uploads of the same file, so a second upload replaces instead of duplicating. */
  key: string;
  localDate: string;
  title: string;
  exercises: ImportedExercise[];
};

export type ParsedWorkouts = {
  kind: "strength" | "cardio";
  workouts: ImportedWorkout[];
  /** True when the file's weight column didn't say kg or lb, so the user is asked. */
  unitUnknown: boolean;
};

export const MAX_WORKOUTS = 3000;

/* ── CSV ──────────────────────────────────────────────────────── */

function parseCsv(text: string): string[][] {
  const head = text.split(/\r?\n/, 3).join("\n");
  // Strong writes ";" in some regions.
  const sep = (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
const pad = (s: string | number) => String(s).padStart(2, "0");

/**
 * The date part of whatever the app wrote: "2026-10-01 18:30:00",
 * "1 Oct 2026, 18:30" (Hevy), "Oct 1, 2026, 6:30:12 PM" (Strava),
 * "10/01/2026" and "2026-10-01 18:30 (EDT)" (Peloton).
 */
export function workoutDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${pad(m[1])}`;
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${pad(m[2])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, a, b, y] = m;
    const month = Number(a) > 12 ? b : a;
    const day = Number(a) > 12 ? a : b;
    return `${y}-${pad(month)}-${pad(day)}`;
  }
  return null;
}

const num = (s: string | undefined) => {
  if (s == null) return null;
  const n = Number(s.replace(/[^\d.\-]/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

/* ── which muscle an exercise works ───────────────────────────── */

/** Most specific first: "leg curl" must not become biceps, "romanian deadlift" not lower back. */
const MUSCLE_RULES: [RegExp, MuscleGroup][] = [
  [/leg curl|hamstring|romanian|\brdl\b|nordic|stiff[- ]leg|good morning/i, "hamstrings"],
  [/leg extension|squat|leg press|lunge|step[- ]?up|hack|split squat|sissy/i, "quads"],
  [/calf|calves/i, "calves"],
  [/hip thrust|glute|bridge|kickback|abduct/i, "glutes"],
  [/oblique|russian twist|woodchop|side bend|side plank/i, "obliques"],
  [/crunch|plank|sit[- ]?up|\bab\b|abs\b|leg raise|knee raise|hollow|rollout|dead bug/i, "abs"],
  [/shrug|trap/i, "traps"],
  [/deadlift|back extension|hyperextension|superman/i, "lower_back"],
  [/wrist|farmer|forearm|grip/i, "forearms"],
  [/tricep|skull|pushdown|push-down|close[- ]grip|dip|overhead extension|kickback/i, "triceps"],
  [/curl|bicep|chin[- ]?up/i, "biceps"],
  [/row|pull[- ]?up|pulldown|pull-down|\blat\b|lats|pullover/i, "lats"],
  [/overhead press|shoulder press|military|lateral raise|front raise|arnold|face pull|rear delt|upright row|\bohp\b|delt/i, "shoulders"],
  [/bench|chest|fly|flye|push[- ]?up|pec|incline press|decline press|press/i, "chest"],
];

export function guessMuscle(exercise: string): MuscleGroup {
  for (const [re, m] of MUSCLE_RULES) if (re.test(exercise)) return m;
  // Something has to light up on the body map; core is the least wrong guess.
  return "abs";
}

/** Cardio types → the muscle that does the work. */
function cardioMuscle(type: string): MuscleGroup {
  const t = type.toLowerCase();
  if (/swim|row|paddle|kayak|climb/.test(t)) return "lats";
  if (/walk|hike|stair|elliptical/.test(t)) return "calves";
  if (/yoga|stretch|pilates|meditation|core/.test(t)) return "abs";
  if (/strength|weight|hiit|crossfit|bootcamp/.test(t)) return "chest";
  return "quads"; // run, ride, cycling, ski, and anything else that's legs-first
}

/* ── the parsers ──────────────────────────────────────────────── */

function columns(header: string[]) {
  const h = header.map((x) => x.toLowerCase());
  const find = (...names: string[]) => {
    for (const n of names) {
      const exact = h.indexOf(n);
      if (exact !== -1) return exact;
    }
    for (const n of names) {
      const loose = h.findIndex((x) => x.includes(n));
      if (loose !== -1) return loose;
    }
    return -1;
  };
  return { h, find };
}

function parseStrength(rows: string[][], lb: boolean | null): ParsedWorkouts {
  const { h, find } = columns(rows[0]);
  const iDate = find("date", "start_time", "start time", "workout date");
  const iTitle = find("workout name", "title", "workout");
  const iExercise = find("exercise name", "exercise_title", "exercise");
  const iWeight = find("weight_kg", "weight (kg)", "weight(kg)", "weight (lbs)", "weight(lbs)", "weight (lb)", "weight");
  const iReps = find("reps");
  const iWarm = find("set_type", "set type", "iswarmup", "warmup");

  const header = iWeight >= 0 ? h[iWeight] : "";
  const fileUnit = /kg/.test(header) ? false : /lb/.test(header) ? true : null;
  const inLb = fileUnit ?? lb ?? false;

  type Acc = { date: string; title: string; stamp: string; ex: Map<string, { sets: number; reps: number | null; kg: number }> };
  const sessions = new Map<string, Acc>();

  for (const r of rows.slice(1)) {
    const date = workoutDate(r[iDate] ?? "");
    const exercise = (r[iExercise] ?? "").trim();
    if (!date || !exercise) continue;
    const warm = iWarm >= 0 ? (r[iWarm] ?? "").toLowerCase() : "";
    if (warm === "warmup" || warm === "warm up" || warm === "true") continue;

    // Fitbod has no workout name, so the day is the session.
    const title = (iTitle >= 0 ? r[iTitle] : "") || "Workout";
    // The raw start (date and time) keeps two sessions on one day apart. Without
    // a workout name (Fitbod) each set has its own time, so the day is the session.
    const stamp = iTitle >= 0 ? (r[iDate] ?? "").trim() : date;
    const key = `${stamp}|${title}`;
    let s = sessions.get(key);
    if (!s) sessions.set(key, (s = { date, title, stamp, ex: new Map() }));

    const weight = num(r[iWeight]);
    const kg = weight == null ? 0 : inLb ? weight * 0.45359237 : weight;
    const reps = num(r[iReps]);
    const e = s.ex.get(exercise) ?? { sets: 0, reps: null, kg: 0 };
    e.sets += 1;
    // The heaviest set is the headline, like Hevy sync and the Log workout form.
    if (kg > e.kg || (kg === e.kg && (reps ?? 0) > (e.reps ?? 0))) {
      e.kg = kg;
      e.reps = reps;
    }
    s.ex.set(exercise, e);
  }

  const workouts = [...sessions.values()].map((s) => ({
    key: `file:${s.stamp}|${s.title}`.toLowerCase(),
    localDate: s.date,
    title: s.title.slice(0, 80),
    exercises: [...s.ex.entries()].slice(0, 60).map(([name, e]) => ({
      name: name.slice(0, 80),
      muscleGroup: guessMuscle(name),
      sets: e.sets || null,
      reps: e.reps != null ? Math.round(e.reps) : null,
      loadGrams: e.kg > 0 ? Math.round(e.kg * 1000) : null,
    })),
  }));
  return { kind: "strength", workouts, unitUnknown: iWeight >= 0 && fileUnit === null };
}

function parseCardio(rows: string[][]): ParsedWorkouts {
  const { h, find } = columns(rows[0]);
  const iDate = find("activity date", "workout timestamp", "start time", "date");
  const iType = find("activity type", "fitness discipline", "sport", "type");
  const iName = find("activity name", "title", "name");
  const iDist = find("distance");
  const distUnit = iDist < 0 ? "" : /\(mi|miles/.test(h[iDist]) ? " mi" : /km/.test(h[iDist]) ? " km" : "";

  const workouts: ImportedWorkout[] = [];
  const seen = new Map<string, number>();
  for (const r of rows.slice(1)) {
    const date = workoutDate(r[iDate] ?? "");
    const type = (iType >= 0 ? r[iType] : "") || "Cardio";
    if (!date) continue;
    const title = ((iName >= 0 ? r[iName] : "") || type).slice(0, 80);
    const dist = iDist >= 0 ? num(r[iDist]) : null;
    const stamp = (r[iDate] ?? "").trim();
    // Same name, same minute: number them rather than merge two activities.
    const base = `file:${stamp}|${title}`.toLowerCase();
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    workouts.push({
      key: n === 1 ? base : `${base}#${n}`,
      localDate: date,
      title,
      exercises: [
        {
          name: (dist ? `${type} · ${dist}${distUnit}` : type).slice(0, 80),
          muscleGroup: cardioMuscle(type),
          sets: null,
          reps: null,
          loadGrams: null,
        },
      ],
    });
  }
  return { kind: "cardio", workouts, unitUnknown: false };
}

/** `lb` is the user's answer to "what unit is the weight in?", when the file doesn't say. */
export function parseWorkoutExport(text: string, lb: boolean | null = null): ParsedWorkouts {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) throw new Error("That file has no rows in it.");
  const { find } = columns(rows[0]);

  const parsed =
    find("exercise name", "exercise_title", "exercise") !== -1
      ? parseStrength(rows, lb)
      : find("activity type", "fitness discipline", "sport", "activity date") !== -1
        ? parseCardio(rows)
        : null;
  if (!parsed) {
    throw new Error(
      `This doesn't look like a workout export. Its columns are: ${rows[0].slice(0, 8).join(", ")}${rows[0].length > 8 ? "…" : ""}`,
    );
  }
  if (parsed.workouts.length === 0) throw new Error("Found the columns but no workouts with a date in them.");
  if (parsed.workouts.length > MAX_WORKOUTS) {
    throw new Error(`That's ${parsed.workouts.length} workouts. Upload ${MAX_WORKOUTS} or fewer at a time.`);
  }
  return parsed;
}
