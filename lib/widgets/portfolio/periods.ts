/** Shared by the server loader and the client tile, so it imports nothing. */
export const PERIODS = [
  { key: "1D", label: "1 Day" },
  { key: "1W", label: "1 Week" },
  { key: "1M", label: "1 Month" },
  { key: "6M", label: "6 Months" },
  { key: "1Y", label: "1 Year" },
  { key: "ALL", label: "All Time" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];
