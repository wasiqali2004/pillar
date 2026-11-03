import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from "adhan";

/**
 * Prayer calculation, client-safe: setup shows a live preview of the times in
 * the browser, and the server uses the same function for the dashboard.
 */

export const PRAYER_METHODS = [
  { id: "NorthAmerica", label: "ISNA (North America)" },
  { id: "MuslimWorldLeague", label: "Muslim World League" },
  { id: "Egyptian", label: "Egyptian General Authority" },
  { id: "Karachi", label: "University of Karachi" },
  { id: "UmmAlQura", label: "Umm al-Qura, Makkah" },
  { id: "Dubai", label: "Dubai" },
  { id: "Qatar", label: "Qatar" },
  { id: "Kuwait", label: "Kuwait" },
  { id: "MoonsightingCommittee", label: "Moonsighting Committee" },
  { id: "Singapore", label: "Singapore" },
  { id: "Turkey", label: "Turkey (Diyanet)" },
  { id: "Tehran", label: "Tehran" },
] as const;

export type PrayerMethod = (typeof PRAYER_METHODS)[number]["id"];
export type AsrSchool = "shafi" | "hanafi";

export type PrayerSettings = {
  latitude: number;
  longitude: number;
  place: string;
  method: PrayerMethod;
  madhab: AsrSchool;
};

export type PlaceResult = { label: string; latitude: number; longitude: number; timezone: string | null };

const BY_ZONE: [RegExp, PrayerMethod][] = [
  [/^America\//, "NorthAmerica"],
  [/^Asia\/(Karachi|Kolkata|Calcutta|Dhaka|Kabul|Colombo|Kathmandu)$/, "Karachi"],
  [/^Asia\/Riyadh$/, "UmmAlQura"],
  [/^Africa\/Cairo$/, "Egyptian"],
  [/^Asia\/(Dubai|Muscat)$/, "Dubai"],
  [/^Asia\/Qatar$/, "Qatar"],
  [/^Asia\/Kuwait$/, "Kuwait"],
  [/^Asia\/(Singapore|Kuala_Lumpur|Jakarta|Brunei|Makassar|Jayapura)$/, "Singapore"],
  [/^Europe\/Istanbul$/, "Turkey"],
  [/^Asia\/Tehran$/, "Tehran"],
];

/** The convention most people in that part of the world follow. Changeable in Settings. */
export function defaultMethod(tz: string | null | undefined): PrayerMethod {
  if (tz) for (const [re, method] of BY_ZONE) if (re.test(tz)) return method;
  return "MuslimWorldLeague";
}

export function methodLabel(id: string) {
  return PRAYER_METHODS.find((m) => m.id === id)?.label ?? id;
}

/** Anything from a form or an old row: a usable setting, or null. */
export function normalizePrayerSettings(v: unknown): PrayerSettings | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  const latitude = Number(s.latitude);
  const longitude = Number(s.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const method = PRAYER_METHODS.some((m) => m.id === s.method) ? (s.method as PrayerMethod) : "MuslimWorldLeague";
  return {
    latitude,
    longitude,
    place: (typeof s.place === "string" ? s.place : "").trim().slice(0, 120) || "My location",
    method,
    madhab: s.madhab === "hanafi" ? "hanafi" : "shafi",
  };
}

export function prayerTimesFor(s: PrayerSettings, day: string) {
  const params = CalculationMethod[s.method]();
  params.madhab = s.madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  const coords = new Coordinates(s.latitude, s.longitude);
  // Summer nights this far north have no true Fajr or Isha; this is the
  // convention for estimating them, so nobody gets a blank or absurd time.
  params.highLatitudeRule = HighLatitudeRule.recommended(coords);
  // Noon UTC lands on the same calendar date wherever the server runs.
  return new PrayerTimes(coords, new Date(`${day}T12:00:00Z`), params);
}
