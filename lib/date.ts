/**
 * The day boundary. Every streak in the app depends on this file.
 *
 * A log at 1am belongs to the night before, so the day rolls over at 4am
 * rather than midnight, in the user's own timezone.
 *
 * This file is imported by client components too, so it can't reach for cookies
 * or request state itself. On the server lib/auth/context.ts registers how to
 * find the signed-in user's timezone; in the browser it's the device's.
 */

export const DAY_START_HOUR = 4;
const FALLBACK_TZ = "America/Toronto";

const g = globalThis as unknown as { __pillarTzResolver?: () => string | undefined };

export function setTzResolver(fn: () => string | undefined) {
  g.__pillarTzResolver = fn;
}

export function isValidTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The current user's IANA timezone, e.g. "America/Toronto". */
export function userTz(): string {
  const resolved = g.__pillarTzResolver?.();
  if (resolved) return resolved;
  if (typeof window !== "undefined") {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (device) return device;
  }
  return FALLBACK_TZ;
}

const fmts = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    fmts.set(tz, f);
  }
  return f;
}

/**
 * The local calendar date (YYYY-MM-DD) an instant belongs to.
 *
 * Shifting the instant back by DAY_START_HOUR before formatting is what makes
 * 2am Tuesday resolve to Monday. Formatting in TZ afterwards is what keeps it
 * correct across DST, when a local day is 23 or 25 hours long.
 */
export function localDate(at: Date = new Date()): string {
  return fmtFor(userTz()).format(new Date(at.getTime() - DAY_START_HOUR * 3_600_000));
}

/** Calendar arithmetic on a YYYY-MM-DD string. Never converts back to wall time. */
export function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Most recent first: [today, yesterday, ...]. */
export function recentDates(n: number, from: string = localDate()): string[] {
  return Array.from({ length: n }, (_, i) => shiftDate(from, -i));
}

/** Whole days between two YYYY-MM-DD strings (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** "Mon", "Tue", ... for a YYYY-MM-DD string. */
export function weekdayLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "short",
    timeZone: "UTC",
  });
}

/* ── period boundaries, all as YYYY-MM-DD strings ─────────────── */

/** Monday-based. "This week" means the calendar week, not a rolling 7 days. */
export function startOfWeek(isoDate: string = localDate()): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return shiftDate(isoDate, -dow);
}

export function startOfMonth(isoDate: string = localDate()): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function startOfYear(isoDate: string = localDate()): string {
  return `${isoDate.slice(0, 4)}-01-01`;
}

/** Days elapsed in the current month, inclusive — for pace calculations. */
export function dayOfMonth(isoDate: string = localDate()): number {
  return Number(isoDate.slice(8, 10));
}

export function daysInMonth(isoDate: string = localDate()): number {
  const [y, m] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
