import { userTz } from "./date";

/** All money is stored in integer cents. These are the only places it becomes a string. */

export function money(cents: number, { sign = false } = {}): string {
  const s = (cents / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: Math.abs(cents) >= 100_000 ? 0 : 2,
  });
  return sign && cents > 0 ? `+${s}` : s;
}

/** "$5.0k" — for tight spaces like goal targets. */
export function moneyCompact(cents: number): string {
  const d = cents / 100;
  if (Math.abs(d) >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
  if (Math.abs(d) >= 1_000) return `$${(d / 1_000).toFixed(d % 1000 === 0 ? 0 : 1)}k`;
  return `$${Math.round(d)}`;
}

export function num(n: number): string {
  return n.toLocaleString("en-CA");
}

export function pct(n: number, { sign = false } = {}): string {
  const s = `${n.toFixed(1)}%`;
  return sign && n > 0 ? `+${s}` : s;
}

/** 445 → "7h 25m" */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** grams → "82.4 kg" */
export function weight(grams: number): string {
  return `${(grams / 1000).toFixed(1)} kg`;
}

export function time(d: Date, tz = userTz()): string {
  return d
    .toLocaleTimeString("en-CA", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s?([ap])\.?m\.?/i, (_m, p) => p.toLowerCase() + "m");
}

/** "in 2h 14m" / "3h ago" */
export function relative(target: Date, from: Date = new Date()): string {
  const mins = Math.round((target.getTime() - from.getTime()) / 60_000);
  const abs = Math.abs(mins);
  const body =
    abs < 60
      ? `${abs}m`
      : `${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}m` : ""}`;
  return mins >= 0 ? `in ${body}` : `${body} ago`;
}
