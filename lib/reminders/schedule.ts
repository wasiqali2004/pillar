import { time } from "@/lib/format";
import { prayerTimesFor, type PrayerSettings } from "@/lib/prayer-options";

/**
 * Deciding what's due, with nothing but numbers going in, so it can be checked
 * without a browser. A reminder stays due for a few minutes: a restart or a slow
 * minute shouldn't lose Asr, but nobody wants a reminder for it an hour later.
 */

export type ReminderPrefs = { prayers: boolean; checkin: boolean; checkinHour: number };
export type Reminder = { key: string; title: string; body: string; tag: string; url: string };

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = { prayers: false, checkin: false, checkinHour: 21 };

export function normalizePrefs(v: unknown): ReminderPrefs {
  const p = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const hour = Number(p.checkinHour);
  return {
    prayers: p.prayers === true,
    checkin: p.checkin === true,
    checkinHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_REMINDER_PREFS.checkinHour,
  };
}

const PRAYERS = [
  ["fajr", "Fajr"],
  ["dhuhr", "Dhuhr"],
  ["asr", "Asr"],
  ["maghrib", "Maghrib"],
  ["isha", "Isha"],
] as const;

const GRACE_MS = 10 * 60_000;

/** The calendar date on the wall where the user is. Not localDate: that rolls over at 4am. */
function calendarDay(now: Date, tz: string) {
  return now.toLocaleDateString("en-CA", { timeZone: tz });
}

export function duePrayers(settings: PrayerSettings, now: Date, tz: string): Reminder[] {
  const today = calendarDay(now, tz);
  // Far enough north, Isha can fall after midnight and belongs to the day before.
  const yesterday = calendarDay(new Date(now.getTime() - 86_400_000), tz);
  const due: Reminder[] = [];
  for (const day of [yesterday, today]) {
    const times = prayerTimesFor(settings, day);
    for (const [id, name] of PRAYERS) {
      const at = times[id];
      const late = now.getTime() - at.getTime();
      if (late >= 0 && late < GRACE_MS) {
        due.push({
          key: `prayer:${day}:${id}`,
          title: `Time for ${name}`,
          body: `${name} came in at ${time(at, tz)}.`,
          tag: `prayer-${id}`,
          url: "/app",
        });
      }
    }
  }
  return due;
}

export function checkinKey(now: Date, tz: string) {
  return `checkin:${calendarDay(now, tz)}`;
}

export function checkinDue(hour: number, now: Date, tz: string) {
  const local = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
  return local === hour;
}
