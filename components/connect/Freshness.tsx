import Link from "next/link";
import { isStale, type SourceHealth } from "@/lib/connections/freshness-types";

/**
 * "Is everything still up to date?" — the answer, per source.
 *
 * Put at the top of Connect because it is the question people actually arrive
 * with. Anything stale is named and given the one action that fixes it, and
 * the auto/manual split is stated plainly: a card with no API will never
 * update itself however many times Refresh is pressed.
 */
export function Freshness({ sources }: { sources: SourceHealth[] }) {
  if (sources.length === 0) return null;

  const stale = sources.filter(isStale);
  const manual = sources.filter((s) => s.how === "manual");
  const errored = sources.filter((s) => s.error || s.action?.label === "Reconnect");

  return (
    <section className="fr-wrap">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-faint">Up to date?</h2>
        <p className="text-[0.72rem] text-muted">
          {stale.length === 0 && errored.length === 0
            ? manual.length > 0
              ? "Everything current. Some of it needs you to keep it that way."
              : "Everything current."
            : `${stale.length + errored.length} need${stale.length + errored.length === 1 ? "s" : ""} attention`}
        </p>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {sources.map((s) => (
          <Row key={s.id} source={s} />
        ))}
      </ul>

      {manual.length > 0 && (
        <p className="mt-3 border-t border-line-soft pt-2.5 text-[0.7rem] leading-relaxed text-faint">
          Amex, Wealthsimple and most Canadian banks publish no API anyone can use for free, so those rows only move
          when you upload a statement. The app can&apos;t fetch them, and pressing Refresh won&apos;t change that.
        </p>
      )}
    </section>
  );
}

function Row({ source: s }: { source: SourceHealth }) {
  const bad = isStale(s) || Boolean(s.error) || s.action?.label === "Reconnect";
  const tone = s.how === "off" ? "is-off" : bad ? "is-bad" : "is-ok";

  return (
    <li className={`fr-row ${tone}`}>
      <span className="fr-dot" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">{s.label}</span>
        <span className="block text-[0.7rem] text-faint">
          {s.error ? <span className="text-bad">{s.error}</span> : s.note}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="tnum block text-[0.72rem] text-muted">{ageLabel(s)}</span>
        <span className="block text-[0.6rem] uppercase tracking-wider text-faint">
          {s.how === "auto" ? "automatic" : s.how === "manual" ? "needs you" : "not set up"}
        </span>
      </span>

      {s.action && (
        // A plain link for OAuth: that route has to redirect the whole page to Google.
        s.action.href.startsWith("/api/") ? (
          <a href={s.action.href} className="fr-act shrink-0">
            {s.action.label}
          </a>
        ) : (
          <Link href={s.action.href} className="fr-act shrink-0">
            {s.action.label}
          </Link>
        )
      )}
    </li>
  );
}

function ageLabel(s: SourceHealth) {
  if (s.coversTo == null) return "—";
  if (s.staleDays == null) return s.coversTo;
  if (s.staleDays === 0) return "today";
  if (s.staleDays === 1) return "yesterday";
  if (s.staleDays < 31) return `${s.staleDays} days ago`;
  const months = Math.round(s.staleDays / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
