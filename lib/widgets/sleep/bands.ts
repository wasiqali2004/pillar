/**
 * Fitbit's own score bands. Kept out of index.ts because that module is
 * server-only — the tile needs this to colour each bar in the browser.
 */
export type SleepBand = "excellent" | "good" | "fair" | "poor";

export function scoreBand(score: number): SleepBand {
  if (score >= 90) return "excellent";
  if (score >= 80) return "good";
  if (score >= 60) return "fair";
  return "poor";
}

export const BAND_LABELS: Record<SleepBand, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};
