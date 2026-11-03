"use client";

import { useRef, useState, useTransition } from "react";
import type { TrainingData } from ".";
import type { Progress } from "./progress";
import {
  loadTrainingAction,
  logWorkoutAction,
  deleteWorkoutAction,
  syncHevyNowAction,
} from "./actions";
import { BodyMap } from "./BodyMap";
import { RoutinesPanel } from "./RoutinesPanel";
import type { RoutineRow } from "./routines";
import { MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroup } from "./muscles";
import { Empty } from "@/components/ui";
import { shiftDate } from "@/lib/date";
import { useOpenFromHash } from "@/components/useOpenFromHash";

/**
 * Training, laid out as a scoreboard first and a log second: streak, this
 * week against the goal, this month, PRs — then the day being viewed beside
 * the body map, with the consistency calendar and recent PRs alongside.
 */
export function TrainingSection({
  initial,
  routines,
}: {
  initial: TrainingData;
  routines: RoutineRow[];
}) {
  const [data, setData] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [selected, setSelected] = useState<MuscleGroup | null>(null);
  const [logging, setLogging] = useState(false);
  const logButton = useRef<HTMLButtonElement>(null);
  useOpenFromHash("#log-workout", () => setLogging(true), logButton);
  const [pending, start] = useTransition();
  const [syncing, startSync] = useTransition();

  // The page re-renders on a timer (AutoRefresh) and after a Hevy sync; when
  // fresh server data arrives, take it — unless he's browsed to another day,
  // in which case keep his place and only refresh the scoreboard.
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setData(
      data.date === prevInitial.date
        ? initial
        : { ...data, progress: { ...initial.progress, dayPRs: data.progress.dayPRs }, hevy: initial.hevy },
    );
  }

  function goto(date: string) {
    setSelected(null);
    start(async () => setData(await loadTrainingAction(date)));
  }

  const p = data.progress;
  const exercisesFor = (m: MuscleGroup) =>
    data.workouts.flatMap((w) => w.exercises.filter((e) => e.muscleGroup === m));

  return (
    <section id="training" className="tile-3d">
      <div className="tile">
        <div className="tile-head flex shrink-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="tile-title text-lg">Training</h2>
            <HevyStatus
              status={data.hevy}
              syncing={syncing}
              onSync={() => startSync(async () => setData(await syncHevyNowAction(data.date)))}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              ref={logButton}
              type="button"
              className={`pill ${logging ? "pill-highlight" : ""}`}
              onClick={() => setLogging((v) => !v)}
            >
              {logging ? "Close" : "Log workout"}
            </button>
          </div>
        </div>

        <div className="tile-body">
          {logging && (
            <div className="mt-4">
              <LogWorkoutForm
                today={p.today}
                onDone={(date) => {
                  setLogging(false);
                  goto(date);
                }}
              />
            </div>
          )}

          <Scoreboard p={p} />

          <div className="mt-5 grid gap-5 lg:grid-cols-[150px_minmax(0,1fr)_minmax(0,460px)]">
            {/* ── the figure, kept small: it's the index, not the headline ── */}
            <div className="flex justify-center [&_.body-stage]:max-w-[140px] [&_p]:hidden">
              <BodyMap worked={data.worked} selected={selected} onSelect={setSelected} />
            </div>

            {/* ── the day being viewed ── */}
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-faint">
                    {data.label} · {data.date}
                  </div>
                  <div className="truncate text-sm font-semibold">
                    {data.workouts.map((w) => w.title).join(" + ") || "Rest day"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    className="pill !px-2.5 !py-1"
                    onClick={() => goto(shiftDate(data.date, -1))}
                    disabled={pending}
                    aria-label="Previous day"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="pill !px-2.5 !py-1"
                    onClick={() => goto(shiftDate(data.date, 1))}
                    disabled={pending}
                    aria-label="Next day"
                  >
                    →
                  </button>
                </div>
              </div>

              {p.dayPRs.length > 0 && (
                <div className="tr-pop mb-3 flex items-center gap-2 rounded-ctl border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
                  <Trophy className="h-4 w-4 shrink-0 text-warn" />
                  <span>
                    <strong className="text-warn">
                      {p.dayPRs.length} new PR{p.dayPRs.length === 1 ? "" : "s"}
                    </strong>{" "}
                    this session — {p.dayPRs.slice(0, 3).join(", ")}
                    {p.dayPRs.length > 3 ? "…" : ""}
                  </span>
                </div>
              )}

              {data.worked.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {data.worked.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelected(selected === m ? null : m)}
                      className={`pill !px-2.5 !py-1 !text-[0.7rem] ${selected === m ? "pill-selected" : ""}`}
                    >
                      {MUSCLE_LABELS[m]}
                      <span className="opacity-60">{exercisesFor(m).length}</span>
                    </button>
                  ))}
                </div>
              )}

              {data.workouts.length === 0 ? (
                <Empty>
                  Nothing logged for {data.label.toLowerCase()}. Pick a day on the
                  calendar, or use <strong>Log workout</strong>.
                </Empty>
              ) : (
                <div className={`flex max-h-[19rem] flex-col gap-3 overflow-y-auto pr-1 ${pending ? "opacity-60" : ""}`}>
                  {data.workouts.map((w) => (
                    <div key={w.id}>
                      <ul className="flex flex-col">
                        {w.exercises.map((e, i) => {
                          const dim = selected != null && e.muscleGroup !== selected;
                          const pr = p.dayPRs.includes(e.name);
                          return (
                            <li
                              key={e.id}
                              className={`tr-rise flex items-center justify-between gap-3 rounded-[6px] px-2 py-1.5 transition-opacity odd:bg-surface-hi/30 ${
                                dim ? "opacity-30" : ""
                              }`}
                              style={{ animationDelay: `${i * 35}ms` }}
                            >
                              <span className="min-w-0 truncate text-[0.8rem]">
                                {e.name}
                                <span className="ml-2 text-[0.6rem] uppercase tracking-wider text-faint">
                                  {MUSCLE_LABELS[e.muscleGroup]}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {pr && (
                                  <span className="flex items-center gap-1 rounded-pill bg-warn/15 px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-wider text-warn">
                                    <Trophy className="h-3 w-3" /> PR
                                  </span>
                                )}
                                <span className="tnum font-mono text-[0.72rem] text-muted">
                                  {[
                                    e.sets != null && e.reps != null ? `${e.sets}×${e.reps}` : null,
                                    e.loadGrams ? load(e.loadGrams, p.unit) : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-1 flex justify-end">
                        <button
                          type="button"
                          className="text-[0.62rem] text-faint hover:text-bad"
                          title="Removes it here only — delete in Hevy to remove it everywhere"
                          onClick={() =>
                            start(async () => {
                              await deleteWorkoutAction(w.id);
                              setData(await loadTrainingAction(data.date));
                            })
                          }
                        >
                          Remove {w.title}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── the long view ── */}
            <div className="flex min-w-0 flex-col gap-5">
              <MonthCalendar p={p} viewing={data.date} onPick={goto} />
              <RecentPRs p={p} onPick={goto} />
            </div>
          </div>

          <Recovery daysSince={data.daysSince} onPick={setSelected} />

          <details className="group mt-4 border-t border-line-soft pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[0.65rem] uppercase tracking-wider text-faint hover:text-muted">
              <span className="transition-transform group-open:rotate-90">›</span>
              Routines · {routines.length}
            </summary>
            <div className="mt-2">
              <RoutinesPanel bare initial={routines} date={data.date} onLogged={() => goto(data.date)} />
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

/* ── weights ── */

function load(grams: number, unit: "lb" | "kg") {
  if (unit === "lb") {
    const lb = Math.round((grams / 1000 / 0.45359237) * 2) / 2;
    return `${lb % 1 ? lb.toFixed(1) : lb} lb`;
  }
  return `${(grams / 1000).toFixed(1)} kg`;
}

/* ── the scoreboard ── */

function Scoreboard({ p }: { p: Progress }) {
  const goalMet = p.thisWeek >= p.weeklyGoal;
  const monthDelta = p.thisMonth - p.lastMonthToDate;

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatCard
        i={0}
        tone="warn"
        icon={<Flame className="h-5 w-5" />}
        value={p.weekStreak}
        unit={p.weekStreak === 1 ? "week" : "weeks"}
        label="Streak"
        hint={`${p.weeklyGoal}+ sessions every week`}
        glow={p.weekStreak >= 4}
      />
      <StatCard
        i={1}
        tone="teal"
        icon={<Ring value={p.thisWeek} goal={p.weeklyGoal} />}
        value={p.thisWeek}
        unit={`/ ${p.weeklyGoal}`}
        label="This week"
        hint={
          goalMet ? (
            <span className="text-teal">
              ✓ Goal hit{p.thisWeek > p.weeklyGoal ? ` · +${p.thisWeek - p.weeklyGoal} bonus` : ""}
              <span className="text-faint"> · {p.setsThisWeek} sets</span>
            </span>
          ) : (
            `${p.weeklyGoal - p.thisWeek} to go · ${p.setsThisWeek} sets`
          )
        }
      />
      <StatCard
        i={2}
        tone="violet"
        icon={<Calendar2 className="h-5 w-5" />}
        value={p.thisMonth}
        unit={p.thisMonth === 1 ? "session" : "sessions"}
        label="This month"
        hint={p.firstDate ? `${p.totalSessions} total since ${monthYear(p.firstDate)}` : "Your first one starts the count"}
        badge={
          monthDelta !== 0
            ? { text: `${monthDelta > 0 ? "▲" : "▼"} ${Math.abs(monthDelta)} vs last`, up: monthDelta > 0 }
            : undefined
        }
      />
      <StatCard
        i={3}
        tone="warn"
        icon={<Trophy className="h-5 w-5" />}
        value={p.prsThisMonth}
        unit={p.prsThisMonth === 1 ? "PR" : "PRs"}
        label="Records this month"
        hint={p.recentPRs[0] ? `Latest: ${p.recentPRs[0].exercise}` : "Lift heavier to set one"}
        glow={p.prsThisMonth > 0}
      />
    </div>
  );
}

function monthYear(d: string | null) {
  if (!d) return "—";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const TONES = {
  teal: "var(--color-teal)",
  violet: "var(--color-violet)",
  warn: "var(--color-warn)",
} as const;

function StatCard({
  i,
  tone,
  icon,
  value,
  unit,
  label,
  hint,
  badge,
  glow,
}: {
  i: number;
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  value: number;
  unit: string;
  label: string;
  hint: React.ReactNode;
  badge?: { text: string; up: boolean };
  glow?: boolean;
}) {
  const c = TONES[tone];
  return (
    <div
      className="tr-pop relative overflow-hidden rounded-ctl border px-3.5 py-3"
      style={{
        animationDelay: `${i * 70}ms`,
        borderColor: `color-mix(in oklab, ${c} 28%, var(--color-line-soft))`,
        background: `radial-gradient(120% 140% at 0% 0%, color-mix(in oklab, ${c} ${glow ? 20 : 11}%, transparent) 0%, transparent 60%)`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
        </span>
        <span style={{ color: c }} className={glow ? "tr-glow" : ""}>
          {icon}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className="tnum text-[1.65rem] font-semibold leading-none"
          style={{ color: c, textShadow: `0 0 16px color-mix(in oklab, ${c} 40%, transparent)` }}
        >
          {value}
        </span>
        <span className="text-xs text-muted">{unit}</span>
        {badge && (
          <span
            className={`tnum ml-auto rounded-pill px-1.5 py-px text-[0.6rem] font-semibold ${
              badge.up ? "bg-teal/15 text-teal" : "bg-bad/15 text-bad"
            }`}
          >
            {badge.text}
          </span>
        )}
      </div>
      <div className="mt-1.5 truncate text-[0.68rem] text-faint">{hint}</div>
    </div>
  );
}

/** Progress ring toward the weekly goal; past the goal it keeps going round. */
function Ring({ value, goal }: { value: number; goal: number }) {
  const r = 9;
  const C = 2 * Math.PI * r;
  const f = Math.min(value / goal, 1);
  const extra = value > goal ? Math.min((value - goal) / goal, 1) : 0;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${C * f} ${C}`}
        className="tr-ring"
      />
      {extra > 0 && (
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="var(--color-violet)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${C * extra} ${C}`}
        />
      )}
    </svg>
  );
}

/* ── this month, day by day: which split he trained ── */

const SPLIT_TONE: Record<string, string> = {
  Push: "var(--color-teal)",
  Pull: "var(--color-violet)",
  Legs: "var(--color-warn)",
  Rest: "var(--color-faint)",
  Other: "var(--color-muted)",
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function MonthCalendar({
  p,
  viewing,
  onPick,
}: {
  p: Progress;
  viewing: string;
  onPick: (d: string) => void;
}) {
  const today = p.today;
  const [month, setMonth] = useState(today.slice(0, 7)); // "YYYY-MM"

  const byDate = new Map<string, Progress["sessions"]>();
  for (const s of p.sessions) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

  const first = `${month}-01`;
  const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];

  const inMonth = p.sessions.filter((s) => s.date.startsWith(month));
  const count = (k: string) => inMonth.filter((s) => s.split === k).length;
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const label = new Date(`${first}T12:00:00Z`).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const earliest = p.firstDate?.slice(0, 7) ?? month;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => shift(-1)}
            disabled={month <= earliest}
            className="grid h-5 w-5 place-items-center rounded-[4px] text-muted hover:bg-surface-hi hover:text-ink disabled:opacity-30"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="min-w-[7.5rem] text-center text-xs font-semibold">{label}</span>
          <button
            type="button"
            onClick={() => shift(1)}
            disabled={month >= today.slice(0, 7)}
            className="grid h-5 w-5 place-items-center rounded-[4px] text-muted hover:bg-surface-hi hover:text-ink disabled:opacity-30"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
        <div className="flex gap-2.5 font-mono text-[0.62rem]">
          {(["Push", "Pull", "Legs"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1" style={{ color: SPLIT_TONE[k] }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SPLIT_TONE[k] }} />
              {k} {count(k)}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="pb-0.5 text-center text-[0.56rem] font-semibold text-faint">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} />;
          const sessions = byDate.get(date) ?? [];
          const future = date > today;
          const main = sessions.find((s) => s.split !== "Rest") ?? sessions[0];
          const tone = main ? SPLIT_TONE[main.split] : null;
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              disabled={future}
              onClick={() => onPick(date)}
              title={sessions.map((s) => s.title).join(" + ") || (future ? "" : "Rest")}
              className={`tr-pop relative flex h-10 flex-col items-start justify-between overflow-hidden rounded-[6px] border px-1.5 py-1 text-left transition-transform hover:-translate-y-px disabled:cursor-default disabled:opacity-35 disabled:hover:translate-y-0 ${
                date === viewing ? "ring-1 ring-ink" : ""
              }`}
              style={{
                animationDelay: `${i * 12}ms`,
                borderColor: tone
                  ? `color-mix(in oklab, ${tone} 45%, transparent)`
                  : isToday
                    ? "var(--color-teal)"
                    : "var(--color-line-soft)",
                background: tone
                  ? `linear-gradient(160deg, color-mix(in oklab, ${tone} 26%, transparent), color-mix(in oklab, ${tone} 8%, transparent))`
                  : "color-mix(in oklab, var(--color-surface-hi) 35%, transparent)",
              }}
            >
              <span className={`tnum text-[0.6rem] ${isToday ? "font-bold text-teal" : "text-faint"}`}>
                {Number(date.slice(8))}
              </span>
              {main && (
                <span
                  className="w-full truncate text-[0.6rem] font-bold uppercase tracking-wide"
                  style={{ color: tone! }}
                >
                  {main.split === "Other" ? main.title : main.split}
                  {sessions.length > 1 && <span className="opacity-70"> +{sessions.length - 1}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── recent PRs ── */

function RecentPRs({ p, onPick }: { p: Progress; onPick: (d: string) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">
        Recent PRs · 30 days
      </div>
      {p.recentPRs.length === 0 ? (
        <p className="text-[0.7rem] text-faint">None yet this month — next heavy set counts.</p>
      ) : (
        <ul className="flex flex-col">
          {p.recentPRs.slice(0, 5).map((r, i) => (
            <li key={`${r.date}:${r.exercise}`}>
              <button
                type="button"
                onClick={() => onPick(r.date)}
                className="tr-rise -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-[6px] px-1.5 py-1 text-left transition-colors hover:bg-surface-hi/60"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <Trophy className="h-3.5 w-3.5 shrink-0 text-warn" />
                <span className="min-w-0 flex-1 truncate text-[0.74rem]">{r.exercise}</span>
                <span className="tnum shrink-0 font-mono text-[0.68rem] text-ink">
                  {load(r.loadGrams, p.unit)}
                  {r.reps ? ` × ${r.reps}` : ""}
                </span>
                <span className="tnum shrink-0 rounded-pill bg-teal/15 px-1.5 py-px font-mono text-[0.6rem] font-semibold text-teal">
                  +{load(r.loadGrams - r.prevGrams, p.unit)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── icons ── */

function Flame({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2c.5 3.5-1.6 5.2-3.2 7C7.3 10.7 6 12.6 6 15a6 6 0 0 0 12 0c0-2.2-1-3.9-2.2-5.3-.3 1.4-1 2.4-2 2.9.4-3.6-.6-7.6-1.8-10.6Z" />
    </svg>
  );
}

function Trophy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v3H8v-3h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3Zm0 4H6v1a2 2 0 0 0 1 1.7V7Zm10 0v2.7A2 2 0 0 0 18 8V7h-1Z" />
    </svg>
  );
}

function Calendar2({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  );
}

/** Days since each group was last trained — the gap is the useful signal. */
function Recovery({
  daysSince,
  onPick,
}: {
  daysSince: Partial<Record<MuscleGroup, number>>;
  onPick: (m: MuscleGroup) => void;
}) {
  return (
    <div className="mt-5 border-t border-line-soft pt-3">
      <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-faint">
        Last trained · 14-day window
      </p>
      <div className="flex flex-wrap gap-1.5">
        {MUSCLE_GROUPS.map((m) => {
          const d = daysSince[m];
          const tone =
            d == null ? "text-faint border-line-soft" : d <= 1 ? "text-teal border-teal/40 bg-teal/10" : d <= 3 ? "text-ink border-line" : "text-warn border-warn/40 bg-warn/10";
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(m)}
              className={`flex items-baseline gap-1.5 rounded-pill border px-2 py-0.5 text-[0.68rem] transition-colors hover:border-teal ${tone}`}
            >
              {MUSCLE_LABELS[m]}
              <span className="tnum font-mono text-[0.62rem] opacity-80">
                {d == null ? "—" : d === 0 ? "today" : `${d}d`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Draft = {
  name: string;
  muscleGroup: MuscleGroup;
  sets: string;
  reps: string;
  load: string;
};

const BLANK: Draft = {
  name: "",
  muscleGroup: "chest",
  sets: "",
  reps: "",
  load: "",
};

/**
 * Starts on today, whichever day the section is showing: the section opens on
 * yesterday, and a session logged from the dashboard is almost always today's.
 */
function LogWorkoutForm({
  today,
  onDone,
}: {
  today: string;
  onDone: (date: string) => void;
}) {
  const [date, setDate] = useState(today);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Draft[]>([{ ...BLANK }]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function patch(i: number, p: Partial<Draft>) {
    setRows((rs) => rs.map((r, j) => (i === j ? { ...r, ...p } : r)));
  }

  const numOrNull = (s: string) => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <form
      className="rounded-ctl border border-line bg-surface-hi/50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const filled = rows.filter((r) => r.name.trim() !== "");
        if (!title.trim()) return setErr("Give the session a name.");
        if (filled.length === 0) return setErr("Add at least one exercise.");
        if (!date || date > today) return setErr("Pick today or an earlier day.");
        setErr(null);
        start(async () => {
          const res = await logWorkoutAction({
            localDate: date,
            title: title.trim(),
            exercises: filled.map((r) => ({
              name: r.name.trim(),
              muscleGroup: r.muscleGroup,
              sets: numOrNull(r.sets),
              reps: numOrNull(r.reps),
              loadGrams:
                numOrNull(r.load) == null
                  ? null
                  : Math.round(Number(r.load) * 1000),
            })),
          });
          if (!res.ok) return setErr(res.error ?? "Could not save.");
          onDone(date);
        });
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Push day"
          className="field max-w-[220px]"
          aria-label="Workout title"
        />
        <label className="flex items-center gap-2 text-xs text-faint">
          on
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="field max-w-[160px]"
            aria-label="Workout date"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={r.name}
              onChange={(e) => patch(i, { name: e.target.value })}
              placeholder="Incline dumbbell press"
              className="field min-w-[160px] flex-1"
              aria-label="Exercise name"
            />
            <select
              value={r.muscleGroup}
              onChange={(e) =>
                patch(i, { muscleGroup: e.target.value as MuscleGroup })
              }
              className="field max-w-[140px]"
              aria-label="Muscle group"
            >
              {MUSCLE_GROUPS.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_LABELS[m]}
                </option>
              ))}
            </select>
            <input
              value={r.sets}
              onChange={(e) => patch(i, { sets: e.target.value })}
              placeholder="sets"
              inputMode="numeric"
              className="field max-w-[70px]"
              aria-label="Sets"
            />
            <input
              value={r.reps}
              onChange={(e) => patch(i, { reps: e.target.value })}
              placeholder="reps"
              inputMode="numeric"
              className="field max-w-[70px]"
              aria-label="Reps"
            />
            <input
              value={r.load}
              onChange={(e) => patch(i, { load: e.target.value })}
              placeholder="kg"
              inputMode="decimal"
              className="field max-w-[80px]"
              aria-label="Load in kilograms"
            />
            {rows.length > 1 && (
              <button
                type="button"
                className="text-xs text-faint hover:text-bad"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                aria-label="Remove exercise"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="pill"
          onClick={() => setRows((rs) => [...rs, { ...BLANK }])}
        >
          + Exercise
        </button>
        <button
          type="submit"
          disabled={pending}
          className="pill pill-selected disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save workout"}
        </button>
      </div>

      {err && (
        <p className="mt-2 text-xs text-bad" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}

/** One quiet line under the header: is Hevy feeding this section? */
function HevyStatus({
  status,
  syncing,
  onSync,
}: {
  status: TrainingData["hevy"];
  syncing: boolean;
  onSync: () => void;
}) {
  if (!status.configured) {
    return (
      <p className="tile-sub font-mono !text-[0.62rem]">
        Logging by hand ·{" "}
        <a href="/app/connect" className="text-teal hover:underline">
          connect Hevy
        </a>
      </p>
    );
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[0.62rem] text-faint">
      {status.lastError ? (
        <span className="text-warn" title={status.lastError}>
          Hevy sync failed · {status.lastError.slice(0, 50)}
        </span>
      ) : (
        <span>
          <span className="tr-live mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-teal align-middle" />
          Live from Hevy
          {status.lastSyncAt &&
            ` · synced ${new Date(status.lastSyncAt).toLocaleTimeString("en-CA", {
              timeZone: "America/Toronto",
              hour: "numeric",
              minute: "2-digit",
            })}`}
        </span>
      )}
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="rounded-pill border border-line px-1.5 py-px text-muted transition-colors hover:border-teal hover:text-teal disabled:opacity-60"
      >
        {syncing ? "Syncing…" : "↻ Sync now"}
      </button>
    </p>
  );
}
