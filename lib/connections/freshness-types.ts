/**
 * Client-safe half of the freshness check: the shape, and the rule for what
 * counts as stale. No server imports.
 *
 * Split out because the Connect page's hub is a client component, so anything
 * it imports as a *value* travels into the browser bundle — importing the
 * staleness helper straight from the server module pulled Plaid, the key
 * vault and the whole database layer with it. `server-only` catches that at
 * build time, not in tsc, so it only shows up as a broken page.
 */

export type How = "auto" | "manual" | "off";

export type SourceHealth = {
  id: string;
  label: string;
  how: How;
  /** Newest date the data itself covers. */
  coversTo: string | null;
  /** Days between that and today. */
  staleDays: number | null;
  /** Last time the app talked to the source, for auto ones. */
  lastRunAt: string | null;
  error: string | null;
  note: string;
  action: { label: string; href: string } | null;
};

/**
 * A manual source gets much longer before it's called out: a statement is
 * something you upload every few weeks, while a watch that hasn't reported in
 * three days means something is actually wrong.
 */
export const MANUAL_STALE_DAYS = 21;
export const AUTO_STALE_DAYS = 3;

export function isStale(s: SourceHealth): boolean {
  if (s.how === "off" || s.staleDays == null) return false;
  return s.staleDays > (s.how === "manual" ? MANUAL_STALE_DAYS : AUTO_STALE_DAYS);
}
