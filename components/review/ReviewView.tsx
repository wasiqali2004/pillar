"use client";

import { useState, useTransition } from "react";
import type { Metric, ReviewSection, Signal, WeeklyReview } from "@/lib/rafiq/review";
import { summariseWeekAction } from "@/lib/rafiq/review-actions";

const DAY = { month: "short", day: "numeric" } as const;

function range(a: string, b: string) {
  const f = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString("en-CA", { ...DAY, timeZone: "UTC" });
  return `${f(a)} – ${f(b)}`;
}

export function ReviewView({ review, canAskRafiq }: { review: WeeklyReview; canAskRafiq: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const wins = review.signals.filter((s) => s.kind === "win");
  const work = review.signals.filter((s) => s.kind !== "win");

  function askRafiq() {
    setError(null);
    start(async () => {
      const r = await summariseWeekAction();
      if (r.ok) setNote(r.text);
      else setError(r.error);
    });
  }

  return (
    <div className="mt-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="grad-text">Your week</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {range(review.weekStart, review.weekEnd)}
            {review.partial && ` · ${review.daysElapsed} day${review.daysElapsed === 1 ? "" : "s"} in, still running`}
          </p>
        </div>
        {canAskRafiq && (
          <button type="button" className="pill pill-highlight" onClick={askRafiq} disabled={pending}>
            {pending ? "Rafiq is reading…" : note ? "Ask again" : "Ask Rafiq to sum it up"}
          </button>
        )}
      </header>

      {error && <p className="mt-4 text-sm text-bad">{error}</p>}

      {note && (
        <blockquote className="rv-note mt-5">
          <span className="rv-note-who">Rafiq</span>
          <p>{note}</p>
        </blockquote>
      )}

      {review.sections.length === 0 ? (
        <p className="mt-8 text-sm text-faint">
          Nothing to review yet — add a widget to your dashboard and start logging.
        </p>
      ) : (
        <>
          {(wins.length > 0 || work.length > 0) && (
            <section className="mt-6 grid gap-3 sm:grid-cols-2">
              {work.map((s) => (
                <SignalCard key={s.id} signal={s} />
              ))}
              {wins.map((s) => (
                <SignalCard key={s.id} signal={s} />
              ))}
            </section>
          )}

          <section className="mt-7 flex flex-col gap-4">
            {review.sections.map((s) => (
              <Section key={s.id} section={s} />
            ))}
          </section>
        </>
      )}

      <p className="mt-8 text-center text-[0.68rem] leading-relaxed text-faint">
        Every number here is counted from what you logged. Rafiq can describe them but never changes them.
      </p>
    </div>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  const icon = signal.kind === "win" ? "✓" : signal.kind === "slip" ? "!" : "→";
  return (
    <article className={`rv-signal is-${signal.kind}`}>
      <span className="rv-signal-icon" aria-hidden>
        {icon}
      </span>
      <p className="text-sm leading-relaxed">
        {signal.text}
        {signal.href && (
          <a href={signal.href} className="ml-1.5 whitespace-nowrap text-teal hover:underline">
            Open →
          </a>
        )}
      </p>
    </article>
  );
}

function Section({ section }: { section: ReviewSection }) {
  return (
    <article className="rv-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-faint">{section.title}</h2>
        <p className="text-sm text-ink">{section.headline}</p>
      </div>
      {section.metrics.length > 0 && (
        <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {section.metrics.map((m) => (
            <MetricRow key={m.label} metric={m} />
          ))}
        </dl>
      )}
    </article>
  );
}

function MetricRow({ metric }: { metric: Metric }) {
  const arrow = metric.trend === "up" ? "▲" : metric.trend === "down" ? "▼" : null;
  const tone = metric.trend === "up" ? "text-teal" : metric.trend === "down" ? "text-bad" : "text-muted";

  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line-soft pb-2">
      <dt className="min-w-0 truncate text-sm text-muted">{metric.label}</dt>
      <dd className="shrink-0 text-right">
        <span className="tnum text-sm font-medium text-ink">{metric.value}</span>
        {arrow && <span className={`ml-1.5 text-[0.68rem] ${tone}`}>{arrow}</span>}
        {(metric.previous || metric.note) && (
          <span className="block text-[0.66rem] text-faint">
            {metric.note ?? `was ${metric.previous}`}
          </span>
        )}
      </dd>
    </div>
  );
}
