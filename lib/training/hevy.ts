import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workouts, workoutExercises, syncState, auditLog } from "@/lib/db/schema";
import type { MuscleGroup } from "./muscles";
import { localDate } from "@/lib/date";
import { getCredentials } from "@/lib/connections/vault";

/**
 * Hevy → workouts. The Training section calls syncHevyIfStale() on render,
 * so a session logged in Hevy shows up here without anyone running a script.
 *
 * First run pulls every workout. After that it reads Hevy's event feed —
 * "updated" and "deleted" since the last sync — so an edit or a deletion in
 * Hevy lands here too, not just new sessions. Synced rows carry Hevy's id in
 * `external_id`; nothing logged locally is ever touched.
 *
 * Each user connects their own key on the Connections page (Hevy Pro → hevy.com/settings?developer).
 * API reference: https://api.hevyapp.com/docs/
 */

const SOURCE = "hevy";
/** Overridable only so the sync can be exercised against a local mock. */
const BASE = process.env.HEVY_API_BASE ?? "https://api.hevyapp.com/v1";
const STALE_AFTER_MS = 30 * 60 * 1000;
/** Hevy's own maximum for workouts and events. */
const PAGE_SIZE = 10;

type HevySet = {
  type: "warmup" | "normal" | "failure" | "dropset" | string;
  weight_kg: number | null;
  reps: number | null;
};

type HevyWorkout = {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  exercises: {
    index: number;
    title: string;
    exercise_template_id: string;
    sets: HevySet[];
  }[];
};

type EventsPage = {
  page: number;
  page_count: number;
  events: (
    | { type: "updated"; workout: HevyWorkout }
    | { type: "deleted"; id: string }
  )[];
};

/**
 * Hevy's muscle vocabulary → the body map's fourteen groups. The judgement
 * calls: "upper_back" (rows, rear delts' neighbours) is drawn as lats, since
 * the map has no separate mid-back; adductors sit on the inner thigh with the
 * quads, abductors with the glutes. Cardio, full body and "other" have no
 * single muscle to light up, so those exercises aren't stored.
 */
const MUSCLE_MAP: Record<string, MuscleGroup | null> = {
  abdominals: "abs",
  shoulders: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  quadriceps: "quads",
  hamstrings: "hamstrings",
  calves: "calves",
  glutes: "glutes",
  abductors: "glutes",
  adductors: "quads",
  lats: "lats",
  upper_back: "lats",
  traps: "traps",
  lower_back: "lower_back",
  chest: "chest",
  neck: "traps",
  cardio: null,
  full_body: null,
  other: null,
};

/**
 * The key the user saved on the Connections page, and only that. A server-wide
 * key would show one person's workouts to everyone.
 */
async function hevyKey(): Promise<string | null> {
  return (await getCredentials("hevy"))?.apiKey || null;
}

export async function hevyConfigured(): Promise<boolean> {
  return (await hevyKey()) !== null;
}

/** Checks a key works before it's saved. */
export async function verifyHevy(apiKey: string): Promise<string> {
  await hevy("/workouts?page=1&pageSize=1", apiKey);
  return "Hevy";
}

async function hevy<T>(path: string, apiKey?: string): Promise<T> {
  const key = apiKey ?? (await hevyKey());
  if (!key) throw new Error("No Hevy API key");
  const res = await fetch(`${BASE}${path}`, {
    headers: { "api-key": key, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new Error(
      res.status === 401 || res.status === 403
        ? `Hevy rejected the API key (${res.status}) — check it, and that the account has Hevy Pro`
        : `Hevy ${res.status}: ${body}`,
    );
  }
  return res.json() as Promise<T>;
}

/* ── exercise template → muscle, cached (templates don't change) ── */

const g = globalThis as unknown as { __pillarHevyMuscles?: Map<string, MuscleGroup | null> };
const muscleCache = (g.__pillarHevyMuscles ??= new Map());

async function musclesFor(templateIds: string[]): Promise<Map<string, MuscleGroup | null>> {
  const missing = [...new Set(templateIds)].filter((id) => !muscleCache.has(id));
  // One at a time, a few in flight — the first full import can need dozens.
  for (let i = 0; i < missing.length; i += 5) {
    await Promise.all(
      missing.slice(i, i + 5).map(async (id) => {
        const t = await hevy<{ primary_muscle_group?: string }>(
          `/exercise_templates/${encodeURIComponent(id)}`,
        );
        muscleCache.set(id, MUSCLE_MAP[t.primary_muscle_group ?? "other"] ?? null);
      }),
    );
  }
  return muscleCache;
}

/* ── writing one workout ── */

/**
 * One row per exercise, matching how the Log workout form stores them:
 * working sets counted (warm-ups left out), and the reps and load of the
 * heaviest set as the headline.
 */
function summarise(sets: HevySet[]) {
  const working = sets.filter((s) => s.type !== "warmup");
  const top = [...working].sort(
    (a, b) => (b.weight_kg ?? 0) - (a.weight_kg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0),
  )[0];
  return {
    sets: working.length || null,
    reps: top?.reps ?? null,
    loadGrams: top?.weight_kg ? Math.round(top.weight_kg * 1000) : null,
  };
}

async function upsertWorkout(w: HevyWorkout) {
  const muscles = await musclesFor(w.exercises.map((e) => e.exercise_template_id));

  const row = {
    localDate: localDate(new Date(w.start_time)),
    title: w.title || "Workout",
    notes: w.description || null,
    source: "hevy" as const,
    externalId: w.id,
  };

  const [existing] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(eq(workouts.externalId, w.id));

  let workoutId: number;
  if (existing) {
    workoutId = existing.id;
    await db.update(workouts).set(row).where(eq(workouts.id, workoutId));
    // Hevy sends the whole workout on every update, so replace the list.
    await db.delete(workoutExercises).where(eq(workoutExercises.workoutId, workoutId));
  } else {
    const [inserted] = await db.insert(workouts).values(row).returning({ id: workouts.id });
    workoutId = inserted.id;
  }

  const exercises = [...w.exercises]
    .sort((a, b) => a.index - b.index)
    .flatMap((e, i) => {
      const muscleGroup = muscles.get(e.exercise_template_id);
      if (!muscleGroup) return [];
      return [{ workoutId, name: e.title, muscleGroup, sortOrder: i, ...summarise(e.sets) }];
    });
  if (exercises.length > 0) await db.insert(workoutExercises).values(exercises);
}

async function removeWorkout(hevyId: string) {
  // Cascades to workout_exercises.
  await db.delete(workouts).where(eq(workouts.externalId, hevyId));
}

/* ── the two sync modes ── */

async function fullImport(): Promise<number> {
  let page = 1;
  let pages = 1;
  let n = 0;
  do {
    const res = await hevy<{ page_count: number; workouts: HevyWorkout[] }>(
      `/workouts?page=${page}&pageSize=${PAGE_SIZE}`,
    );
    pages = res.page_count ?? 1;
    for (const w of res.workouts ?? []) {
      await upsertWorkout(w);
      n++;
    }
    page++;
  } while (page <= pages);
  return n;
}

async function applyEventsSince(since: string): Promise<number> {
  let page = 1;
  let pages = 1;
  let n = 0;
  do {
    const res = await hevy<EventsPage>(
      `/workouts/events?page=${page}&pageSize=${PAGE_SIZE}&since=${encodeURIComponent(since)}`,
    );
    pages = res.page_count ?? 1;
    // Hevy omits `events` entirely on a page with no changes since the cursor
    // rather than sending an empty array, so iterating it directly throws and
    // the whole sync fails on the most ordinary outcome there is: nothing new.
    for (const e of res.events ?? []) {
      if (e.type === "updated") await upsertWorkout(e.workout);
      else if (e.type === "deleted") await removeWorkout(e.id);
      n++;
    }
    page++;
  } while (page <= pages);
  return n;
}

async function recordSync(cursor: string | null, error: string | null) {
  const row = {
    source: SOURCE,
    cursor,
    lastRunAt: new Date().toISOString(),
    lastError: error?.slice(0, 500) ?? null,
  };
  await db
    .insert(syncState)
    .values(row)
    .onConflictDoUpdate({ target: syncState.source, set: row });
}

export async function syncHevy(): Promise<{ changed: number; mode: "full" | "events" }> {
  const [state] = await db.select().from(syncState).where(eq(syncState.source, SOURCE));
  // Taken before fetching, so anything edited mid-sync is caught next time.
  const startedAt = new Date().toISOString();

  try {
    const mode = state?.cursor ? "events" : "full";
    const changed =
      mode === "events" ? await applyEventsSince(state!.cursor!) : await fullImport();

    await recordSync(startedAt, null);
    if (changed > 0) {
      await db.insert(auditLog).values({
        actor: "rafiq",
        action: "training.hevy_sync",
        tableName: "workouts",
        payload: { mode, changed },
      });
    }
    return { changed, mode };
  } catch (e) {
    // Keep the old cursor so the next attempt replays from the same point.
    await recordSync(state?.cursor ?? null, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** What the Training section calls on render. Throttled, and never throws —
    a dead API shows the workouts already synced. */
export async function syncHevyIfStale(): Promise<void> {
  if (!(await hevyConfigured())) return;

  const [state] = await db.select().from(syncState).where(eq(syncState.source, SOURCE));
  if (state?.lastRunAt && Date.now() - Date.parse(state.lastRunAt) < STALE_AFTER_MS) {
    return;
  }
  try {
    await syncHevy();
  } catch {
    // recordSync already stored the reason.
  }
}

export async function hevyStatus() {
  const [state] = await db.select().from(syncState).where(eq(syncState.source, SOURCE));
  return {
    configured: await hevyConfigured(),
    lastSyncAt: state?.lastRunAt ?? null,
    lastError: state?.lastError ?? null,
  };
}
