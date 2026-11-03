/**
 * Imports Fitbit sleep data into body_metrics (sleep_minutes, sleep_score).
 *
 * Fitbit splits the two numbers across two different files in its export, so
 * this accepts either and merges them by date:
 *
 *   sleep_score.csv        — timestamp + overall_score, but NO total duration
 *   sleep-YYYY-MM-DD.json  — dateOfSleep + minutesAsleep, but no score
 *
 * Point it at the export folder and it reads both, so one run fills in hours
 * and score together. A generic CSV with date/hours/score columns also works,
 * for anything not coming from Fitbit.
 *
 * Getting the export: Fitbit app → Account → Manage Data → Export Your Data
 * (or Google Takeout → Fitbit). Unzip it and pass the folder.
 *
 * Usage:
 *   npm run import:sleep -- <file-or-folder> [--commit] [--since=YYYY-MM-DD]
 *
 * Without --commit this prints a preview and writes nothing. Re-running is
 * safe: rows upsert by date, and a field the file doesn't carry is left as it
 * was rather than overwritten with null — so importing scores after durations
 * (or vice versa) merges instead of clobbering.
 */
import { ownerDbUrl } from "./lib/owner-db.mts";
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const commit = args.includes("--commit");
const since = args.find((a) => a.startsWith("--since="))?.slice(8) ?? null;

if (!target) {
  console.error(
    "Usage: npm run import:sleep -- <file-or-folder> [--commit] [--since=YYYY-MM-DD]",
  );
  process.exit(1);
}

/* ── CSV parsing (quoted fields, embedded commas, "" escapes) ── */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function findCol(headers: string[], names: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const i = norm.indexOf(n);
    if (i !== -1) return i;
  }
  // fall back to a substring match, for headers like "Minutes Asleep (total)"
  for (const n of names) {
    const i = norm.findIndex((h) => h.includes(n));
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * Fitbit stamps sleep with the date you WOKE UP, which is already what this
 * app calls that night — its day rolls over at 4am, so a 7am wake belongs to
 * the same calendar day. No shifting needed.
 */
function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, a, b, y] = m;
    const mm = Number(a) > 12 ? b : a;
    const dd = Number(a) > 12 ? a : b;
    return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};

/* ── accumulator: one record per night, filled from any number of files ── */

type Night = { minutes: number | null; score: number | null };
const nights = new Map<string, Night>();
let sourcesRead = 0;

function record(date: string, minutes: number | null, score: number | null) {
  if (minutes == null && score == null) return;
  const cur = nights.get(date) ?? { minutes: null, score: null };
  // Longest sleep wins for a date with several entries — Fitbit logs naps as
  // separate records and the main sleep is the one worth charting.
  if (minutes != null && (cur.minutes == null || minutes > cur.minutes)) {
    cur.minutes = minutes;
  }
  if (score != null) cur.score = score;
  nights.set(date, cur);
}

const DATE_NAMES = ["dateofsleep", "date of sleep", "timestamp", "date", "sleep date", "start time"];
const SCORE_NAMES = ["overall_score", "overall score", "sleep score", "score"];
const MINUTE_NAMES = ["minutesasleep", "minutes asleep", "minutes_asleep", "duration_minutes", "asleep (minutes)"];
const HOUR_NAMES = ["hours asleep", "hours", "duration_hours", "sleep duration (h)"];
/** Fitbit's sleep JSON reports duration in milliseconds. */
const MS_NAMES = ["duration"];

function readCsv(file: string) {
  const rows = parseCsv(readFileSync(file, "utf-8").replace(/^﻿/, ""));
  if (rows.length < 2) return;

  const h = rows[0];
  const dateCol = findCol(h, DATE_NAMES);
  const scoreCol = findCol(h, SCORE_NAMES);
  const minCol = findCol(h, MINUTE_NAMES);
  const hourCol = findCol(h, HOUR_NAMES);

  if (dateCol === -1 || (scoreCol === -1 && minCol === -1 && hourCol === -1)) {
    console.log(`  · ${basename(file)} — no sleep columns, skipped`);
    return;
  }

  console.log(`  ✓ ${basename(file)} — date:"${h[dateCol]}"${
    scoreCol !== -1 ? ` score:"${h[scoreCol]}"` : ""
  }${minCol !== -1 ? ` minutes:"${h[minCol]}"` : ""}${
    hourCol !== -1 ? ` hours:"${h[hourCol]}"` : ""
  }`);

  let n = 0;
  for (const cells of rows.slice(1)) {
    const date = parseDate(cells[dateCol] ?? "");
    if (!date) continue;
    const hours = hourCol !== -1 ? numOrNull(cells[hourCol]) : null;
    const minutes =
      minCol !== -1 ? numOrNull(cells[minCol]) : hours == null ? null : hours * 60;
    const score = scoreCol !== -1 ? numOrNull(cells[scoreCol]) : null;
    record(date, minutes == null ? null : Math.round(minutes), score);
    n++;
  }
  sourcesRead++;
  console.log(`      ${n} rows`);
}

function readJson(file: string) {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    console.log(`  · ${basename(file)} — not valid JSON, skipped`);
    return;
  }
  const list = Array.isArray(data) ? data : [data];

  let n = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const date = parseDate(
      String(o.dateOfSleep ?? o.date ?? o.endTime ?? o.startTime ?? ""),
    );
    if (!date) continue;

    let minutes = numOrNull(o.minutesAsleep);
    if (minutes == null) {
      const ms = numOrNull(o[MS_NAMES[0]]);
      if (ms != null) minutes = Math.round(ms / 60000);
    }
    const score = numOrNull(o.overall_score ?? o.sleepScore ?? o.score);
    if (minutes == null && score == null) continue;

    record(date, minutes, score);
    n++;
  }
  if (n > 0) {
    sourcesRead++;
    console.log(`  ✓ ${basename(file)} — ${n} sleep records`);
  }
}

/* ── walk the target ── */

function ingest(p: string) {
  const ext = extname(p).toLowerCase();
  if (ext === ".csv") readCsv(p);
  else if (ext === ".json") readJson(p);
}

console.log(`Reading ${target}\n`);
const st = statSync(target);
if (st.isDirectory()) {
  const files = readdirSync(target)
    .filter((f) => /\.(csv|json)$/i.test(f))
    // sleep-*.json and sleep_score.csv first; they're what we actually want.
    .sort((a, b) => Number(b.toLowerCase().includes("sleep")) - Number(a.toLowerCase().includes("sleep")));
  for (const f of files) ingest(join(target, f));
} else {
  ingest(target);
}

if (sourcesRead === 0) {
  console.error(
    "\n✗ No sleep data found. Expected a Fitbit sleep_score.csv, a sleep-*.json, " +
      "or a CSV with date + hours/score columns.",
  );
  process.exit(1);
}

/* ── preview ── */

let entries = [...nights.entries()].sort(([a], [b]) => a.localeCompare(b));
if (since) entries = entries.filter(([d]) => d >= since);

if (entries.length === 0) {
  console.error("\n✗ Parsed 0 usable nights.");
  process.exit(1);
}

const withMinutes = entries.filter(([, v]) => v.minutes != null);
const withScore = entries.filter(([, v]) => v.score != null);
const avg = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b) / xs.length) : 0;
const hhmm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

console.log(
  `\nParsed ${entries.length} nights (${entries[0][0]} → ${entries.at(-1)![0]})`,
);
console.log(`  with duration: ${withMinutes.length}`);
console.log(`  with score:    ${withScore.length}`);
if (withMinutes.length)
  console.log(`  avg duration:  ${hhmm(avg(withMinutes.map(([, v]) => v.minutes!)))}`);
if (withScore.length)
  console.log(`  avg score:     ${avg(withScore.map(([, v]) => v.score!))}`);

console.log("\nSample (most recent 7):");
for (const [d, v] of entries.slice(-7)) {
  console.log(
    `  ${d}  ${v.minutes == null ? "     —" : hhmm(v.minutes).padStart(6)}  ` +
      `score ${v.score ?? "—"}`,
  );
}

if (!commit) {
  console.log(
    `\nDry run — nothing written. Re-run with --commit to import ${entries.length} nights.`,
  );
  process.exit(0);
}

/* ── write ── */

const db = createClient({ url: await ownerDbUrl() });

let written = 0;
for (const [date, v] of entries) {
  await db.execute({
    sql: `insert into body_metrics (local_date, sleep_minutes, sleep_score, source)
          values (?, ?, ?, 'health_export')
          on conflict(local_date) do update set
            sleep_minutes = coalesce(excluded.sleep_minutes, body_metrics.sleep_minutes),
            sleep_score   = coalesce(excluded.sleep_score,   body_metrics.sleep_score)`,
    args: [date, v.minutes, v.score],
  });
  written++;
}

await db.execute({
  sql: `insert into audit_log (actor, action, table_name, payload, created_at)
        values ('user', 'sleep.import', 'body_metrics', ?, ?)`,
  args: [
    JSON.stringify({
      nights: written,
      from: entries[0][0],
      to: entries.at(-1)![0],
      source: basename(target),
    }),
    new Date().toISOString(),
  ],
});

console.log(`\n✓ Imported ${written} nights into body_metrics.`);
