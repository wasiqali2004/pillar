import {
  sqliteTable,
  integer,
  text,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { MUSCLE_GROUPS } from "../training/muscles.ts";

const now = () => new Date().toISOString();

/* ── habits ─────────────────────────────────────────────────── */

export const habits = sqliteTable("habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  cadence: text("cadence", { enum: ["daily", "weekly", "x_per_week"] })
    .notNull()
    .default("daily"),
  /** For x_per_week: how many days a week. For daily: always 1. */
  targetCount: integer("target_count").notNull().default(1),
  /** null = binary habit. Otherwise "min", "pages", "glasses", ... */
  unit: text("unit"),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export const habitLogs = sqliteTable(
  "habit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    habitId: integer("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    /** UTC instant the log was made. */
    loggedAt: text("logged_at").notNull().$defaultFn(now),
    /** The day it counts for, per lib/date.ts. Streaks group by this. */
    localDate: text("local_date").notNull(),
    value: real("value"),
    source: text("source", { enum: ["ui", "rafiq", "import"] })
      .notNull()
      .default("ui"),
    note: text("note"),
  },
  (t) => [
    // Stops a double-tap from silently corrupting every streak downstream.
    uniqueIndex("habit_logs_habit_date_uq").on(t.habitId, t.localDate),
    index("habit_logs_date_idx").on(t.localDate),
  ],
);

/* ── tasks ──────────────────────────────────────────────────── */

export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    forDate: text("for_date").notNull(),
    doneAt: text("done_at"),
    /** How many days this has been rolled forward. Visible on the tile. */
    carriedCount: integer("carried_count").notNull().default(0),
    createdAt: text("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("tasks_for_date_idx").on(t.forDate)],
);

/* ── money ──────────────────────────────────────────────────── */

export const moneyEntries = sqliteTable(
  "money_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Integer cents. Never a float. */
    amountCents: integer("amount_cents").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    category: text("category"),
    occurredOn: text("occurred_on").notNull(),
    note: text("note"),
    /**
     * Which card or account this came from — "Amex", "TD", "Wealthsimple".
     * Null for manual entries. Part of the import fingerprint below, because
     * the same coffee on the same day on two cards is two real transactions,
     * not a duplicate.
     */
    account: text("account"),
    source: text("source", { enum: ["ui", "csv", "rafiq", "plaid"] })
      .notNull()
      .default("ui"),
    /**
     * Hash of (date, amount, direction, description) from the source CSV row.
     * Bank exports have no stable transaction id, so this is what lets a
     * re-imported or overlapping-date-range file skip rows it already wrote
     * instead of double-counting spend. Null for non-CSV rows.
     */
    importFingerprint: text("import_fingerprint"),
    createdAt: text("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("money_occurred_idx").on(t.occurredOn),
    uniqueIndex("money_import_fingerprint_uq").on(t.importFingerprint),
  ],
);

/* ── activities (source-agnostic on purpose — see plan §03) ─── */

export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  durationSec: integer("duration_sec"),
  distanceM: real("distance_m"),
  startedAt: text("started_at").notNull(),
  source: text("source", { enum: ["health_export", "manual"] })
    .notNull()
    .default("manual"),
  raw: text("raw", { mode: "json" }),
});

/* ── plumbing ───────────────────────────────────────────────── */

export const syncState = sqliteTable("sync_state", {
  source: text("source").primaryKey(),
  cursor: text("cursor"),
  lastRunAt: text("last_run_at"),
  lastError: text("last_error"),
});

/**
 * OAuth tokens for the one user, keyed by provider ("google_health").
 *
 * Google only returns a refresh token on the first consent, so a re-auth that
 * omits it must not overwrite the stored one with null — see saveTokens().
 */
export const oauthTokens = sqliteTable("oauth_tokens", {
  provider: text("provider").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  /** ISO instant the access token stops working. Refresh before this. */
  expiresAt: text("expires_at").notNull(),
  scope: text("scope"),
  connectedAt: text("connected_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
});

export type OAuthToken = typeof oauthTokens.$inferSelect;

/**
 * One row per linked bank/card — Amex, TD, Wealthsimple, EQ Bank. Plaid calls
 * a linked account an "Item"; item_id is Plaid's own id for the connection,
 * not ours, so it's the natural primary key.
 */
export const plaidItems = sqliteTable("plaid_items", {
  itemId: text("item_id").primaryKey(),
  accessToken: text("access_token").notNull(),
  /** "American Express", "TD Canada Trust", ... — whatever Plaid returns. */
  institutionName: text("institution_name"),
  /** Cursor for /transactions/sync. Null starts a fresh pull from scratch. */
  cursor: text("cursor"),
  connectedAt: text("connected_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
});

export type PlaidItem = typeof plaidItems.$inferSelect;

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  threadId: text("thread_id").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  toolCalls: text("tool_calls", { mode: "json" }),
  model: text("model"),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

/** Every write Rafiq makes lands here. This is how you undo one. */
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actor: text("actor", { enum: ["user", "rafiq", "system"] }).notNull(),
  action: text("action").notNull(),
  tableName: text("table_name").notNull(),
  rowId: integer("row_id"),
  payload: text("payload", { mode: "json" }),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export type Habit = typeof habits.$inferSelect;
export type HabitLog = typeof habitLogs.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type MoneyEntry = typeof moneyEntries.$inferSelect;

/* ── prayers ────────────────────────────────────────────────── */

export const PRAYER_NAMES = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;

export const prayerLogs = sqliteTable(
  "prayer_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    localDate: text("local_date").notNull(),
    prayer: text("prayer", { enum: PRAYER_NAMES }).notNull(),
    prayedAt: text("prayed_at").notNull().$defaultFn(now),
    source: text("source", { enum: ["ui", "rafiq"] }).notNull().default("ui"),
  },
  (t) => [
    uniqueIndex("prayer_logs_date_prayer_uq").on(t.localDate, t.prayer),
    index("prayer_logs_date_idx").on(t.localDate),
  ],
);

/* ── quran memorization ─────────────────────────────────────── */

export const surahProgress = sqliteTable(
  "surah_progress",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    surahNumber: integer("surah_number").notNull(),
    name: text("name").notNull(),
    ayahCount: integer("ayah_count").notNull(),
    status: text("status", {
      enum: ["not_started", "learning", "memorized"],
    })
      .notNull()
      .default("not_started"),
    /** Ayahs done so far, for partial progress on long surahs. */
    ayahsDone: integer("ayahs_done").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: text("updated_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("surah_progress_number_uq").on(t.surahNumber)],
);

/* ── quran reading ──────────────────────────────────────────────
   Separate from memorization: reading any of the 114 surahs is not the same
   as tracking one for hifz, and the reader must work for surahs that aren't on
   the memorization list. The Quran text itself is never stored here — it is
   cached verbatim from the source under data/quran/ (see lib/quran/source.ts). */

export const quranReading = sqliteTable(
  "quran_reading",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    surahNumber: integer("surah_number").notNull(),
    /** First ayah of the page he was on. Ayah, not page index, is the resume
        point — page boundaries come from the source and could shift. */
    ayah: integer("ayah").notNull().default(1),
    /** Page index within the surah (1-based), kept for display. */
    page: integer("page").notNull().default(1),
    updatedAt: text("updated_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("quran_reading_surah_uq").on(t.surahNumber)],
);

export const quranBookmarks = sqliteTable(
  "quran_bookmarks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    surahNumber: integer("surah_number").notNull(),
    ayah: integer("ayah").notNull(),
    /** "page" bookmarks anchor on the page's first ayah. */
    kind: text("kind", { enum: ["ayah", "page"] }).notNull().default("ayah"),
    createdAt: text("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("quran_bookmarks_uq").on(t.surahNumber, t.ayah, t.kind),
  ],
);

export const quranNotes = sqliteTable(
  "quran_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    surahNumber: integer("surah_number").notNull(),
    /** null = a reflection on the surah as a whole. */
    ayah: integer("ayah"),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(now),
    updatedAt: text("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("quran_notes_surah_idx").on(t.surahNumber)],
);

/* ── body metrics: steps, sleep, weight ─────────────────────── */

export const bodyMetrics = sqliteTable(
  "body_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    localDate: text("local_date").notNull(),
    steps: integer("steps"),
    sleepMinutes: integer("sleep_minutes"),
    /**
     * Fitbit's 0–100 nightly sleep score. Kept separate from sleepMinutes
     * because duration and quality diverge — an 8h night scored 61 is the
     * interesting case, and averaging them into one number would hide it.
     */
    sleepScore: integer("sleep_score"),
    /** Total kcal burned that day, BMR included — Fitbit's headline number. */
    caloriesBurned: integer("calories_burned"),
    weightGrams: integer("weight_grams"),
    source: text("source", { enum: ["ui", "health_export", "rafiq"] })
      .notNull()
      .default("ui"),
  },
  (t) => [uniqueIndex("body_metrics_date_uq").on(t.localDate)],
);

/* ── investments ────────────────────────────────────────────── */

export const holdings = sqliteTable(
  "holdings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    label: text("label"),
    shares: real("shares").notNull(),
    /** Total paid, in cents. */
    costBasisCents: integer("cost_basis_cents").notNull(),
    /**
     * Market value for a position no price feed can quote — a segregated fund
     * or insurance contract, whose units are priced by the insurer, not an
     * exchange. When set, `shares` and live pricing are both ignored and this
     * is the value. Null for anything with a real ticker.
     */
    manualValueCents: integer("manual_value_cents"),
    /** Statement date of `manualValueCents`, so a stale snapshot reads as one. */
    valuedOn: text("valued_on"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("holdings_symbol_uq").on(t.symbol)],
);

/**
 * Holdings synced from a brokerage via Plaid (Wealthsimple, EQ Bank) — kept
 * separate from `holdings` above rather than merged into it, because a manual
 * position is keyed by symbol alone while a synced one is keyed per account:
 * the same ETF held in a TFSA and an RRSP is two real rows, not one.
 *
 * There's no incremental cursor for investments the way there is for
 * transactions, so each sync replaces every row for an item wholesale —
 * see replaceItemHoldings() in lib/portfolio/plaid-investments.ts.
 */
export const plaidInvestmentHoldings = sqliteTable(
  "plaid_investment_holdings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: text("item_id")
      .notNull()
      .references(() => plaidItems.itemId, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    /** "TFSA", "Non-Registered", whatever Plaid/the brokerage calls it. */
    accountName: text("account_name"),
    /** Null for a security with no ticker (e.g. some cash/other positions). */
    symbol: text("symbol"),
    shares: real("shares").notNull(),
    /** Total paid, in cents — null when the brokerage doesn't report it. */
    costBasisCents: integer("cost_basis_cents"),
    /** Institution-reported price, in cents — already a live-ish figure. */
    priceCents: integer("price_cents"),
    valueCents: integer("value_cents"),
    /** ISO currency of the three amounts above — not assumed to be CAD. */
    currency: text("currency"),
    updatedAt: text("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("plaid_holdings_account_symbol_uq").on(
      t.itemId,
      t.accountId,
      t.symbol,
    ),
    index("plaid_holdings_item_idx").on(t.itemId),
  ],
);

export type PlaidInvestmentHolding = typeof plaidInvestmentHoldings.$inferSelect;

/** Last known price per symbol, so the tile still renders when the feed is down. */
export const priceCache = sqliteTable("price_cache", {
  symbol: text("symbol").primaryKey(),
  priceCents: integer("price_cents").notNull(),
  changePct: real("change_pct"),
  currency: text("currency"),
  fetchedAt: text("fetched_at").notNull(),
});

/* ── business revenue (Sabr / Shopify) ──────────────────────── */

export const businessRevenue = sqliteTable(
  "business_revenue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    localDate: text("local_date").notNull(),
    revenueCents: integer("revenue_cents").notNull(),
    orderCount: integer("order_count").notNull().default(0),
    source: text("source").notNull().default("shopify"),
  },
  (t) => [uniqueIndex("business_revenue_date_source_uq").on(t.localDate, t.source)],
);

/* ── training: workouts and the muscles they hit ────────────── */

/**
 * The muscle vocabulary lives in lib/training/muscles.ts so the client-side
 * body map can import it without pulling drizzle into the browser bundle.
 * Re-exported here because the column enum below is defined from it.
 */
export { MUSCLE_GROUPS, type MuscleGroup } from "../training/muscles.ts";

export const workouts = sqliteTable(
  "workouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The day it counts for, per lib/date.ts — same 4am boundary as everything else. */
    localDate: text("local_date").notNull(),
    /** "Push day", "Legs", "Pull" — free text, his labels not mine. */
    title: text("title").notNull(),
    notes: text("notes"),
    source: text("source", { enum: ["ui", "rafiq", "import", "hevy"] })
      .notNull()
      .default("ui"),
    /** The Hevy workout id for a synced session — what lets a later edit or
        delete in Hevy find its row here. Null for anything logged locally. */
    externalId: text("external_id"),
    createdAt: text("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("workouts_date_idx").on(t.localDate),
    uniqueIndex("workouts_external_id_uq").on(t.externalId),
  ],
);

export const workoutExercises = sqliteTable(
  "workout_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workoutId: integer("workout_id")
      .notNull()
      .references(() => workouts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    muscleGroup: text("muscle_group", { enum: MUSCLE_GROUPS }).notNull(),
    sets: integer("sets"),
    reps: integer("reps"),
    /** Grams, like body weight — integers only, no float drift on a 2.5kg plate. */
    loadGrams: integer("load_grams"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("workout_exercises_workout_idx").on(t.workoutId)],
);

export type Workout = typeof workouts.$inferSelect;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;

/* ── routines: the templates a workout gets logged from ─────── */

/**
 * A routine is the plan ("Chest and Bicep"); a workout is the session that
 * happened. Separate tables on purpose — editing the plan must not rewrite
 * history, and one routine gets logged many times.
 */
export const routines = sqliteTable("routines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** "Push", "Pull", "Legs" — the split this belongs to. Free text. */
  splitLabel: text("split_label"),
  notes: text("notes"),
  /** Whatever the tracker estimated. Null when unknown. */
  estimatedMinutes: integer("estimated_minutes"),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export const routineExercises = sqliteTable(
  "routine_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    routineId: integer("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Null for cardio and anything that maps to no trained group. */
    muscleGroup: text("muscle_group", { enum: MUSCLE_GROUPS }),
    sets: integer("sets"),
    /**
     * A planned rep range, not a logged count: "5-6 reps" is repLow 5,
     * repHigh 6. A single number sets both. Null means untracked (Treadmill).
     */
    repLow: integer("rep_low"),
    repHigh: integer("rep_high"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("routine_exercises_routine_idx").on(t.routineId)],
);

export type Routine = typeof routines.$inferSelect;
export type RoutineExercise = typeof routineExercises.$inferSelect;

/* ── goals ──────────────────────────────────────────────────── */

export const GOAL_METRICS = [
  "business_revenue",
  "income",
  "spend",
  "workouts",
  "surahs_memorized",
  "prayers",
  "steps_avg",
  "weight",
  "habit_rate",
  "custom",
] as const;

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  metric: text("metric", { enum: GOAL_METRICS }).notNull(),
  /** Money metrics are in CENTS, like everywhere else. Others are plain units. */
  targetValue: real("target_value").notNull(),
  unit: text("unit"),
  period: text("period", { enum: ["week", "month", "year", "once"] })
    .notNull()
    .default("month"),
  /** "spend" and "weight" goals are at_most; everything else at_least. */
  direction: text("direction", { enum: ["at_least", "at_most"] })
    .notNull()
    .default("at_least"),
  /** Only used when metric = "custom". */
  manualProgress: real("manual_progress").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(now),
});

export type PrayerName = (typeof PRAYER_NAMES)[number];
export type SurahProgress = typeof surahProgress.$inferSelect;
export type BodyMetric = typeof bodyMetrics.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
export type Goal = typeof goals.$inferSelect;

/* ── app settings ───────────────────────────────────────────── */

/**
 * Small JSON documents keyed by name: the onboarding answers and the
 * dashboard layout. One row per key, so a single-user app needs no user
 * table yet; when accounts land this gains a user_id and a composite key.
 */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
});
