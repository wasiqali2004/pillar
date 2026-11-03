/**
 * Reads steps, calories and sleep out of a Fitbit / Google Takeout export.
 *
 * This is the route that needs nothing but the files: the Google Health API
 * requires a Google Cloud project before anyone can connect, and the old
 * Fitbit Web API is switched off from 2 November 2026. A data export still
 * works, and keeps working, because it is a download rather than an API.
 *
 * Client-safe on purpose — the files are parsed in the browser and only the
 * daily totals are sent to the server, so a year of minute-by-minute
 * heart-rate and location files never leaves the device.
 *
 * Formats it understands, detected from the contents rather than the name:
 *   steps-2026-10-01.json       minute rows  [{dateTime, value}]      → summed
 *   calories-2026-10-01.json    minute rows, kcal                     → summed
 *   sleep-2026-10-01.json       [{dateOfSleep, minutesAsleep, …}]
 *   sleep_score.csv             timestamp + overall_score
 *   any CSV with a date column plus steps / calories / sleep columns
 */

export type HealthRow = {
  /** YYYY-MM-DD */
  date: string;
  steps: number | null;
  calories: number | null;
  sleepMinutes: number | null;
  sleepScore: number | null;
};

export type ParsedHealth = {
  rows: HealthRow[];
  /** One line per file, for the "what did it find" list. */
  files: { name: string; kind: string; days: number; skipped?: string }[];
};

export const MAX_DAYS = 1500;
export const MAX_FILE_BYTES = 40_000_000;

/* ── small helpers ────────────────────────────────────────────── */

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
/** Fitbit writes MM/DD/YY in its minute files and M/D/YYYY in some CSVs. */
const SLASHED = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/;

const pad = (n: number | string) => String(n).padStart(2, "0");

/** Any of Fitbit's date spellings → YYYY-MM-DD, or null if it isn't a date. */
export function toDate(raw: string): string | null {
  const s = raw.trim().replace(/^"|"$/g, "");
  const iso = ISO.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const sl = SLASHED.exec(s);
  if (sl) {
    const [, m, d, y] = sl;
    // A 2-digit year is this century: these exports start in 2007 at the
    // earliest, and "26" is 2026 rather than 1926.
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const month = Number(m);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  return null;
}

function num(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[",\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Splits one CSV line, honouring quoted fields that contain commas. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/* ── accumulating days across files ───────────────────────────── */

type Day = {
  steps: number | null;
  calories: number | null;
  sleepMinutes: number | null;
  sleepScore: number | null;
  /** Set when sleep came from a record Fitbit flagged as the main sleep. */
  mainSleep: boolean;
};

class Days {
  private map = new Map<string, Day>();

  get(date: string): Day {
    let d = this.map.get(date);
    if (!d) {
      d = { steps: null, calories: null, sleepMinutes: null, sleepScore: null, mainSleep: false };
      this.map.set(date, d);
    }
    return d;
  }

  /** Minute rows arrive in pieces, so these add rather than replace. */
  add(date: string, field: "steps" | "calories", value: number) {
    const d = this.get(date);
    d[field] = (d[field] ?? 0) + value;
  }

  size() {
    return this.map.size;
  }

  rows(): HealthRow[] {
    return [...this.map.entries()]
      .map(([date, d]) => ({
        date,
        steps: d.steps == null ? null : Math.round(d.steps),
        calories: d.calories == null ? null : Math.round(d.calories),
        sleepMinutes: d.sleepMinutes,
        sleepScore: d.sleepScore,
      }))
      .filter((r) => r.steps != null || r.calories != null || r.sleepMinutes != null || r.sleepScore != null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

/* ── per-format readers ───────────────────────────────────────── */

type Reader = (text: string, days: Days) => { kind: string; days: number } | null;

/** [{dateTime: "10/01/26 00:00:00", value: "43"}] — steps or calories. */
const readMinuteJson: Reader = (text, days) => {
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (typeof first !== "object" || first == null || !("dateTime" in first) || !("value" in first)) {
    return null;
  }

  // Steps are whole numbers per minute; calories are fractional (1.2 kcal).
  // Whichever it is, the file holds one metric, so sniff it once.
  const sample = data.slice(0, 400).map((r) => num((r as { value: unknown }).value) ?? 0);
  const anyFractional = sample.some((v) => !Number.isInteger(v));
  const field: "steps" | "calories" = anyFractional ? "calories" : "steps";

  const seen = new Set<string>();
  for (const row of data as { dateTime: string; value: unknown }[]) {
    const date = toDate(row.dateTime);
    const value = num(row.value);
    if (!date || value == null) continue;
    days.add(date, field, value);
    seen.add(date);
  }
  if (seen.size === 0) return null;
  return { kind: field === "steps" ? "Steps" : "Calories", days: seen.size };
};

/** [{dateOfSleep: "2026-10-01", minutesAsleep: 417, mainSleep: true}] */
const readSleepJson: Reader = (text, days) => {
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data.length === 0) return null;
  const seen = new Set<string>();

  for (const row of data as Record<string, unknown>[]) {
    if (typeof row !== "object" || row == null) continue;
    const date = toDate(String(row.dateOfSleep ?? row.endTime ?? ""));
    // minutesAsleep is the one to trust; duration is milliseconds in bed and
    // only stands in when the export doesn't carry the asleep total.
    const minutes =
      num(row.minutesAsleep) ?? (row.duration != null ? num(Number(row.duration) / 60000) : null);
    if (!date || minutes == null || minutes <= 0) continue;

    const main = row.mainSleep === true;
    const d = days.get(date);
    // Naps are logged separately. The flagged main sleep wins; with nothing
    // flagged, the longest record for that date does.
    if (d.sleepMinutes == null || (main && !d.mainSleep) || (main === d.mainSleep && minutes > d.sleepMinutes)) {
      d.sleepMinutes = Math.round(minutes);
      d.mainSleep = main || d.mainSleep;
    }
    seen.add(date);
  }
  if (seen.size === 0) return null;
  return { kind: "Sleep", days: seen.size };
};

/** Any CSV with a date column and at least one column we recognise. */
const readCsv: Reader = (text, days) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const header = splitCsv(lines[0]).map((h) => h.toLowerCase().replace(/^"|"$/g, ""));
  const find = (...needles: string[]) =>
    header.findIndex((h) => needles.some((n) => h.includes(n)));

  const iDate = find("date", "timestamp", "day");
  if (iDate < 0) return null;

  const iSteps = find("steps");
  const iCal = find("calories burned", "calories", "kcal");
  // "minutes asleep" and "total minutes asleep"; hours handled separately.
  const iSleepMin = header.findIndex((h) => h.includes("minute") && h.includes("sleep"));
  const iSleepHrs = header.findIndex((h) => h.includes("hour") && h.includes("sleep"));
  const iScore = find("overall_score", "sleep score", "overall score");
  if (iSteps < 0 && iCal < 0 && iSleepMin < 0 && iSleepHrs < 0 && iScore < 0) return null;

  const kinds: string[] = [];
  if (iSteps >= 0) kinds.push("steps");
  if (iCal >= 0) kinds.push("calories");
  if (iSleepMin >= 0 || iSleepHrs >= 0) kinds.push("sleep");
  if (iScore >= 0) kinds.push("sleep score");

  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    const date = toDate(cells[iDate] ?? "");
    if (!date) continue;
    const d = days.get(date);

    // A daily CSV holds one row per day, so these replace rather than add —
    // re-reading the same file twice must not double the day's steps.
    const steps = iSteps >= 0 ? num(cells[iSteps]) : null;
    const cal = iCal >= 0 ? num(cells[iCal]) : null;
    const mins = iSleepMin >= 0 ? num(cells[iSleepMin]) : null;
    const hrs = iSleepHrs >= 0 ? num(cells[iSleepHrs]) : null;
    const score = iScore >= 0 ? num(cells[iScore]) : null;

    if (steps != null) d.steps = steps;
    if (cal != null) d.calories = cal;
    if (mins != null && mins > 0) d.sleepMinutes = Math.round(mins);
    else if (hrs != null && hrs > 0) d.sleepMinutes = Math.round(hrs * 60);
    if (score != null && score > 0 && score <= 100) d.sleepScore = Math.round(score);
    seen.add(date);
  }
  if (seen.size === 0) return null;
  return { kind: kinds.join(" + ").replace(/^./, (c) => c.toUpperCase()), days: seen.size };
};

/* ── the entry point ──────────────────────────────────────────── */

export type InputFile = { name: string; text: string };

/**
 * Reads every file it was given into one set of days. Files it doesn't
 * recognise are reported rather than thrown — an export folder is full of
 * heart rate and GPS files that have nothing to do with this.
 */
export function parseHealthExport(files: InputFile[]): ParsedHealth {
  const days = new Days();
  const out: ParsedHealth["files"] = [];

  for (const f of files) {
    const trimmed = f.text.trim();
    if (!trimmed) {
      out.push({ name: f.name, kind: "—", days: 0, skipped: "Empty file" });
      continue;
    }

    const json = trimmed.startsWith("[") || trimmed.startsWith("{");
    const readers: Reader[] = json ? [readSleepJson, readMinuteJson] : [readCsv];

    let hit: { kind: string; days: number } | null = null;
    let why = json ? "Not a steps, calories or sleep file" : "No date column recognised";
    for (const read of readers) {
      try {
        hit = read(trimmed, days);
      } catch (e) {
        why = e instanceof SyntaxError ? "Not valid JSON" : String(e).slice(0, 80);
        hit = null;
      }
      if (hit) break;
    }

    out.push(
      hit
        ? { name: f.name, kind: hit.kind, days: hit.days }
        : { name: f.name, kind: "—", days: 0, skipped: why },
    );
  }

  return { rows: days.rows(), files: out };
}
