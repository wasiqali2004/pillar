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
 *   Garmin UDSFile / sleepData  [{calendarDate, totalSteps, …}]
 *   Apple Health export.xml     read by parseAppleHealth (streamed; it's huge)
 *   any CSV with a date column plus steps / calories / sleep / weight columns
 *   (Oura, Whoop and MyFitnessPal exports land here)
 */

export type HealthRow = {
  /** YYYY-MM-DD */
  date: string;
  steps: number | null;
  calories: number | null;
  sleepMinutes: number | null;
  sleepScore: number | null;
  weightKg: number | null;
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
  weightKg: number | null;
  /** Set when sleep came from a record Fitbit flagged as the main sleep. */
  mainSleep: boolean;
};

class Days {
  private map = new Map<string, Day>();

  get(date: string): Day {
    let d = this.map.get(date);
    if (!d) {
      d = { steps: null, calories: null, sleepMinutes: null, sleepScore: null, weightKg: null, mainSleep: false };
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
        weightKg: d.weightKg == null ? null : Math.round(d.weightKg * 10) / 10,
      }))
      .filter(
        (r) => r.steps != null || r.calories != null || r.sleepMinutes != null || r.sleepScore != null || r.weightKg != null,
      )
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

/** Garmin's export: [{calendarDate, totalSteps, totalKilocalories}] or [{calendarDate, deepSleepSeconds, …}]. */
const readGarminJson: Reader = (text, days) => {
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0] as Record<string, unknown>;
  if (typeof first !== "object" || first == null || !("calendarDate" in first)) return null;

  const seen = new Set<string>();
  let kind = "";
  for (const row of data as Record<string, unknown>[]) {
    const date = toDate(String(row.calendarDate ?? ""));
    if (!date) continue;
    const d = days.get(date);
    const steps = num(row.totalSteps);
    const kcal = num(row.totalKilocalories);
    const asleep = ["deepSleepSeconds", "lightSleepSeconds", "remSleepSeconds"]
      .map((k) => num(row[k]))
      .filter((n): n is number => n != null);
    if (steps != null) d.steps = steps;
    if (kcal != null) d.calories = kcal;
    if (asleep.length) {
      const mins = Math.round(asleep.reduce((a, b) => a + b, 0) / 60);
      if (mins > 0) d.sleepMinutes = mins;
    }
    if (steps != null || kcal != null || asleep.length) seen.add(date);
    kind = asleep.length ? "Sleep" : "Steps + calories";
  }
  if (seen.size === 0) return null;
  return { kind: `Garmin ${kind.toLowerCase()}`, days: seen.size };
};

/**
 * Any CSV with a date column and at least one column we recognise. Oura,
 * Whoop and MyFitnessPal exports all come through here, so the column
 * names are matched loosely ("Asleep duration (min)", "total_sleep_duration").
 */
const readCsv: Reader = (text, days) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const header = splitCsv(lines[0]).map((h) => h.toLowerCase().replace(/^"|"$/g, ""));
  const find = (...needles: string[]) =>
    header.findIndex((h) => needles.some((n) => h.includes(n)));

  const iDate = find("date", "timestamp", "day", "start time");
  if (iDate < 0) return null;

  const iSteps = find("steps");
  const iCal = find("calories burned", "energy burned", "total_calories", "calories", "kcal");
  const sleepCol = (...units: string[]) =>
    header.findIndex((h) => (h.includes("sleep") || h.includes("asleep")) && units.some((u) => h.includes(u)));
  // "Minutes Asleep", Whoop's "Asleep duration (min)"; hours and seconds separately.
  const iSleepMin = sleepCol("minute", "(min)");
  const iSleepHrs = sleepCol("hour");
  // Oura's total_sleep_duration is seconds.
  const iSleepSec = sleepCol("second", "(s)", "total_sleep_duration");
  const iScore = find("overall_score", "sleep score", "overall score", "sleep performance");
  const iWeight = header.findIndex((h) => h.includes("weight") && !h.includes("goal"));
  if (iSteps < 0 && iCal < 0 && iSleepMin < 0 && iSleepHrs < 0 && iSleepSec < 0 && iScore < 0 && iWeight < 0) return null;
  // MyFitnessPal and most scales write pounds in North America; trust the header when it says.
  const weightInLb = iWeight >= 0 && !header[iWeight].includes("kg");

  const kinds: string[] = [];
  if (iSteps >= 0) kinds.push("steps");
  if (iCal >= 0) kinds.push("calories");
  if (iSleepMin >= 0 || iSleepHrs >= 0 || iSleepSec >= 0) kinds.push("sleep");
  if (iScore >= 0) kinds.push("sleep score");
  if (iWeight >= 0) kinds.push("weight");

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
    const secs = iSleepSec >= 0 ? num(cells[iSleepSec]) : null;
    const score = iScore >= 0 ? num(cells[iScore]) : null;
    const weight = iWeight >= 0 ? num(cells[iWeight]) : null;

    if (steps != null) d.steps = steps;
    if (cal != null) d.calories = cal;
    if (mins != null && mins > 0) d.sleepMinutes = Math.round(mins);
    else if (hrs != null && hrs > 0) d.sleepMinutes = Math.round(hrs * 60);
    else if (secs != null && secs > 0) d.sleepMinutes = Math.round(secs / 60);
    if (score != null && score > 0 && score <= 100) d.sleepScore = Math.round(score);
    if (weight != null && weight > 0) d.weightKg = weightInLb ? weight * 0.45359237 : weight;
    seen.add(date);
  }
  if (seen.size === 0) return null;
  return { kind: kinds.join(" + ").replace(/^./, (c) => c.toUpperCase()), days: seen.size };
};

/* ── Apple Health ─────────────────────────────────────────────── */

const APPLE_TYPES = {
  HKQuantityTypeIdentifierStepCount: "steps",
  HKQuantityTypeIdentifierActiveEnergyBurned: "calories",
  HKQuantityTypeIdentifierBasalEnergyBurned: "calories",
  HKQuantityTypeIdentifierBodyMass: "weight",
  HKCategoryTypeIdentifierSleepAnalysis: "sleep",
} as const;

/** "2026-10-01 23:10:00 -0400" → epoch ms. */
function appleTime(s: string): number {
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  return m ? Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : Date.parse(s);
}

/**
 * Reads Apple Health's export.xml, which is often hundreds of megabytes, a
 * chunk at a time so the browser never holds it as one string.
 *
 * An iPhone and an Apple Watch both record steps, and the export keeps both,
 * so adding them all would double the day. Apple's own app de-duplicates; the
 * close stand-in here is to total each source separately and keep the
 * biggest source for the day. Sleep gets the same treatment, counting only
 * the "asleep" stages, against the date the night ended.
 */
export async function parseAppleHealth(
  file: Blob,
  onProgress?: (fraction: number) => void,
): Promise<ParsedHealth> {
  // date → source → total
  const sums: Record<"steps" | "calories" | "sleep", Map<string, Map<string, number>>> = {
    steps: new Map(),
    calories: new Map(),
    sleep: new Map(),
  };
  const weights = new Map<string, number>();
  const bump = (kind: "steps" | "calories" | "sleep", date: string, source: string, v: number) => {
    let bySource = sums[kind].get(date);
    if (!bySource) sums[kind].set(date, (bySource = new Map()));
    bySource.set(source, (bySource.get(source) ?? 0) + v);
  };

  const attr = (tag: string, name: string) => {
    const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
    return m ? m[1] : "";
  };

  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let read = 0;
  let records = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      read += value.length;
      buffer += decoder.decode(value, { stream: true });
    }
    // Only scan up to the last complete tag; the rest waits for the next chunk.
    const cut = done ? buffer.length : buffer.lastIndexOf(">") + 1;
    const chunk = buffer.slice(0, cut);
    buffer = buffer.slice(cut);

    for (const m of chunk.matchAll(/<Record\b[^>]*>/g)) {
      const tag = m[0];
      const type = attr(tag, "type") as keyof typeof APPLE_TYPES;
      const kind = APPLE_TYPES[type];
      if (!kind) continue;
      records++;
      const source = attr(tag, "sourceName") || "?";
      const start = attr(tag, "startDate");
      const end = attr(tag, "endDate");

      if (kind === "sleep") {
        // Older exports say ...Asleep, newer ones ...AsleepCore / Deep / REM / Unspecified.
        if (!attr(tag, "value").includes("Asleep")) continue;
        const date = toDate(end);
        const minutes = (appleTime(end) - appleTime(start)) / 60000;
        if (date && Number.isFinite(minutes) && minutes > 0 && minutes < 1440) bump("sleep", date, source, minutes);
        continue;
      }

      const date = toDate(start);
      const v = num(attr(tag, "value"));
      if (!date || v == null) continue;
      if (kind === "weight") {
        const unit = attr(tag, "unit").toLowerCase();
        weights.set(date, unit === "lb" ? v * 0.45359237 : unit === "g" ? v / 1000 : v);
      } else if (kind === "calories") {
        // Apple writes kcal as "Cal" or "kcal"; the odd kJ export is converted.
        bump("calories", date, source, attr(tag, "unit") === "kJ" ? v / 4.184 : v);
      } else {
        bump("steps", date, source, v);
      }
    }

    onProgress?.(file.size ? Math.min(1, read / file.size) : 0);
    if (done) break;
  }

  const days = new Days();
  const best = (bySource: Map<string, number>) => Math.max(...bySource.values());
  for (const [date, s] of sums.steps) days.get(date).steps = best(s);
  for (const [date, s] of sums.calories) days.get(date).calories = best(s);
  for (const [date, s] of sums.sleep) days.get(date).sleepMinutes = Math.round(best(s));
  for (const [date, kg] of weights) days.get(date).weightKg = kg;

  const rows = days.rows();
  return {
    rows,
    files: [{ name: "export.xml", kind: records ? "Apple Health" : "—", days: rows.length, skipped: records ? undefined : "No steps, energy, sleep or weight records found" }],
  };
}

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
    const readers: Reader[] = json ? [readGarminJson, readSleepJson, readMinuteJson] : [readCsv];

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
