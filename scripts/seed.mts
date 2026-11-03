/**
 * Structural seed data. Idempotent — safe to re-run, it never overwrites
 * anything you've since edited in the app.
 *
 * Measurement data (steps, weight, money, revenue) is deliberately NOT seeded.
 * Fake numbers on a personal dashboard are worse than an empty state.
 */
import { ownerDbUrl } from "./lib/owner-db.mts";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { habits, surahProgress, goals, holdings } from "../lib/db/schema.ts";

/* ── habits ─────────────────────────────────────────────────────
   Placeholders. Rule of thumb: binary and same-day verifiable.       */
const HABITS = [
  { name: "Gym", cadence: "x_per_week" as const, targetCount: 4 },
  { name: "Read 10 pages", cadence: "daily" as const, targetCount: 1 },
  { name: "Morning adhkar", cadence: "daily" as const, targetCount: 1 },
  { name: "8k steps", cadence: "daily" as const, targetCount: 1 },
  { name: "No phone after 11", cadence: "daily" as const, targetCount: 1 },
];

/* ── surahs to memorize ─────────────────────────────────────────
   Ayah counts follow the standard Hafs numbering. Add any surah by
   appending a row — the tile renders whatever is in this table.     */
const SURAHS = [
  { surahNumber: 1, name: "Al-Fatihah", ayahCount: 7 },
  { surahNumber: 67, name: "Al-Mulk", ayahCount: 30 },
  { surahNumber: 78, name: "An-Naba", ayahCount: 40 },
  { surahNumber: 36, name: "Ya-Sin", ayahCount: 83 },
  { surahNumber: 55, name: "Ar-Rahman", ayahCount: 78 },
  { surahNumber: 56, name: "Al-Waqi'ah", ayahCount: 96 },
  { surahNumber: 18, name: "Al-Kahf", ayahCount: 110 },
  { surahNumber: 93, name: "Ad-Duha", ayahCount: 11 },
  { surahNumber: 94, name: "Ash-Sharh", ayahCount: 8 },
  { surahNumber: 97, name: "Al-Qadr", ayahCount: 5 },
  { surahNumber: 99, name: "Az-Zalzalah", ayahCount: 8 },
  { surahNumber: 103, name: "Al-Asr", ayahCount: 3 },
  { surahNumber: 105, name: "Al-Fil", ayahCount: 5 },
  { surahNumber: 106, name: "Quraysh", ayahCount: 4 },
  { surahNumber: 107, name: "Al-Ma'un", ayahCount: 7 },
  { surahNumber: 108, name: "Al-Kawthar", ayahCount: 3 },
  { surahNumber: 109, name: "Al-Kafirun", ayahCount: 6 },
  { surahNumber: 110, name: "An-Nasr", ayahCount: 3 },
  { surahNumber: 112, name: "Al-Ikhlas", ayahCount: 4 },
  { surahNumber: 113, name: "Al-Falaq", ayahCount: 5 },
  { surahNumber: 114, name: "An-Nas", ayahCount: 6 },
];

/* ── goals ──────────────────────────────────────────────────────
   Money targets are in CENTS, like every other amount in this app.  */
const GOALS = [
  {
    title: "All 5 prayers, every day",
    metric: "prayers" as const,
    targetValue: 150,
    unit: "prayers",
    period: "month" as const,
    direction: "at_least" as const,
  },
  {
    title: "16 workouts a month",
    metric: "workouts" as const,
    targetValue: 16,
    unit: "workouts",
    period: "month" as const,
    direction: "at_least" as const,
  },
  {
    title: "Memorize surahs",
    metric: "surahs_memorized" as const,
    targetValue: 2,
    unit: "surahs",
    period: "month" as const,
    direction: "at_least" as const,
  },
];

/* ── holdings ───────────────────────────────────────────────────
   PLACEHOLDERS — replace with your real positions. Prices are fetched
   live; only symbol, shares and cost basis are stored here.          */
const HOLDINGS = [
  { symbol: "VFV.TO", label: "S&P 500 (CAD)", shares: 10, costBasisCents: 150_000 },
  { symbol: "XEQT.TO", label: "All-Equity", shares: 25, costBasisCents: 80_000 },
];

const client = createClient({
  url: await ownerDbUrl(),
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
const db = drizzle(client);

async function seed<T extends Record<string, unknown>>(
  label: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  rows: T[],
) {
  const existing = await db.select().from(table);
  if (existing.length > 0) {
    console.log(`· ${label}: ${existing.length} rows already present, skipping`);
    return;
  }
  await db.insert(table).values(rows.map((r, i) => ({ ...r, sortOrder: i })));
  console.log(`✓ ${label}: seeded ${rows.length}`);
}

await seed("habits", habits, HABITS);
await seed("surahs", surahProgress, SURAHS);
await seed("goals", goals, GOALS);
await seed("holdings", holdings, HOLDINGS);

client.close();
