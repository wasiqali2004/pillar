"use client";

import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import type { BodyData } from ".";
import { logBodyAction } from "../actions";
import { Tile } from "@/components/ui";
import { num, duration, weight } from "@/lib/format";
import { useOpenFromHash } from "@/components/useOpenFromHash";

const STEP_TARGET = 8000;
const SLEEP_TARGET_MIN = 8 * 60;

/** One accent per metric, pulled from the theme so the rings match every other tile. */
const TONES = {
  teal: { from: "var(--color-teal)", to: "var(--color-teal-dim)", text: "text-teal" },
  violet: { from: "#a58bff", to: "var(--color-violet)", text: "text-violet" },
  amber: { from: "#ffd27a", to: "var(--color-warn)", text: "text-warn" },
} as const;
type Tone = keyof typeof TONES;

export function BodyTile({ data }: { data: BodyData }) {
  const [open, setOpen] = useState(false);
  const logButton = useRef<HTMLButtonElement>(null);
  useOpenFromHash("#log-body", () => setOpen(true), logButton);
  const leadIsToday = data.leadDay === data.today;

  return (
    <Tile
      title="Body"
      sub={`${leadIsToday ? "Today" : "Yesterday"} · ${dayLabel(data.leadDay)}`}
      right={
        <button
          ref={logButton}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`pill ${open ? "pill-selected" : ""}`}
          aria-expanded={open}
        >
          {open ? "Close" : "Log"}
        </button>
      }
    >
      {open && <LogForm onDone={() => setOpen(false)} />}

      {data.noData && !data.needsReconnect && (
        // Three dashes and no explanation looked like a broken tile. It isn't
        // broken, there is simply nothing connected yet.
        <a
          href="/app/connect"
          className="mt-3 block rounded-ctl border border-dashed border-line px-3 py-2 text-xs text-muted hover:border-teal hover:text-ink"
        >
          No steps, calories or sleep yet — connect Fitbit or upload your data →
        </a>
      )}

      {data.needsReconnect && (
        // Only a plain navigation starts OAuth — the route redirects to Google.
        <a
          href="/api/auth/google-health"
          className="mt-3 block rounded-ctl border border-line bg-surface-hi/50 px-3 py-2 text-xs text-muted hover:text-ink"
        >
          Your Fitbit connection needs renewing. Reconnect in one tap →
        </a>
      )}

      {/* The three numbers that matter each morning, as rings. Fixed three
          columns, and a container query rather than breakpoints: the tile's
          own width is the signal, not the viewport's. */}
      <div className="@container mt-3">
        <div className="grid grid-cols-3 gap-2">
          <Ring
            tone="teal"
            icon="👟"
            value={data.stepsLead}
            goal={STEP_TARGET}
            display={data.stepsLead == null ? "—" : num(data.stepsLead)}
            label="Steps"
            avg={data.stepsAvg}
          />
          <Ring
            tone="violet"
            icon="🔥"
            value={data.caloriesLead}
            // No calorie goal exists, so the ring fills at your own 7-day average.
            goal={data.caloriesAvg}
            display={data.caloriesLead == null ? "—" : num(data.caloriesLead)}
            label="Calories"
            avg={data.caloriesAvg}
          />
          <Ring
            tone="amber"
            icon="🌙"
            value={data.sleepLast}
            goal={SLEEP_TARGET_MIN}
            display={data.sleepLast == null ? "—" : duration(data.sleepLast)}
            label={data.sleepLastOn && data.sleepLastOn !== data.today ? `Sleep · ${dayLabel(data.sleepLastOn).split(",")[0]}` : "Sleep"}
            avg={data.sleepAvg}
          />
        </div>
      </div>

      {!leadIsToday && (data.stepsToday != null || data.caloriesToday != null) && (
        <p className="tnum mt-3 text-center text-[0.72rem] text-muted">
          Today so far
          {data.stepsToday != null && <> · <b className="font-semibold text-ink">{num(data.stepsToday)}</b> steps</>}
          {data.caloriesToday != null && <> · <b className="font-semibold text-ink">{num(data.caloriesToday)}</b> kcal</>}
        </p>
      )}

      <div className="mt-4 rounded-ctl border border-line-soft bg-void/30 px-3 pb-2 pt-2">
        <div className="mb-1.5 text-[0.6rem] uppercase tracking-wider text-faint">
          Last 7 days
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Trend tone="teal" values={data.steps7} target={STEP_TARGET} />
          <Trend tone="violet" values={data.calories7} />
          <Trend
            tone="amber"
            values={data.sleep7}
            target={SLEEP_TARGET_MIN}
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2 pb-1">
        <Chip
          label="Weight"
          value={data.weightLatest == null ? "—" : weight(data.weightLatest)}
          hint={
            data.weightChange30 != null
              ? `${data.weightChange30 > 0 ? "+" : ""}${(data.weightChange30 / 1000).toFixed(1)} kg / 30d`
              : undefined
          }
        />
        <Chip
          label="Workouts"
          value={`${data.workoutsMonth} this month`}
          hint={`${data.workoutsWeek} this week`}
        />
      </div>
    </Tile>
  );
}

/* ── rings ──────────────────────────────────────────────────── */

function Ring({
  tone,
  icon,
  value,
  goal,
  display,
  label,
  avg,
}: {
  tone: Tone;
  icon: ReactNode;
  value: number | null;
  goal: number | null;
  display: string;
  label: string;
  avg: number | null;
}) {
  const id = useId();
  const t = TONES[tone];
  const size = 64;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac =
    value == null || goal == null || goal <= 0 ? 0 : Math.min(1, value / goal);
  const hit = value != null && goal != null && value >= goal;

  return (
    // Stacked while the tile is narrow; ring beside the number once there's room.
    <div className="flex min-w-0 flex-col items-center gap-1 text-center @[400px]:flex-row @[400px]:gap-2.5 @[400px]:text-left">
      <div className="relative grid h-10 w-10 shrink-0 place-items-center @[400px]:h-12 @[400px]:w-12">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-full w-full -rotate-90"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={t.from} />
              <stop offset="100%" stopColor={t.to} />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-line)"
            strokeOpacity={0.5}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
            opacity={frac === 0 ? 0 : 1}
            style={{
              transition: "stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)",
              // A soft halo on the arc only, and only once the goal is met.
              filter: hit ? `drop-shadow(0 0 3px ${t.from})` : undefined,
            }}
          />
        </svg>
        <span
          className="absolute text-[0.8rem] leading-none @[400px]:text-base"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>

      <div className="min-w-0 max-w-full">
        <div className="tnum truncate text-sm font-semibold leading-none text-ink [text-shadow:0_1px_2px_rgba(0,0,0,0.5)] @[400px]:text-base">
          {display}
        </div>
        <div
          className={`mt-1 truncate text-[0.58rem] uppercase tracking-wider opacity-80 @[400px]:text-[0.62rem] ${t.text}`}
        >
          {label}
        </div>
        <Delta value={value} avg={avg} />
      </div>
    </div>
  );
}

/** "▲ 6%" against the 7-day average — how yesterday compares with the week, not just the raw number. */
function Delta({ value, avg }: { value: number | null; avg: number | null }) {
  if (value == null || avg == null || avg === 0) {
    return <div className="mt-1 hidden h-4 @[400px]:block" />;
  }
  const pct = Math.round(((value - avg) / avg) * 100);
  const flat = Math.abs(pct) < 2;
  return (
    // Hidden in the narrow layout — the number itself matters more than the delta.
    <div
      className={`tnum mt-1 hidden h-4 items-center whitespace-nowrap rounded-full px-1.5 text-[0.62rem] @[400px]:inline-flex ${
        flat
          ? "bg-line/40 text-muted"
          : pct > 0
            ? "bg-teal/10 text-teal"
            : "bg-bad/10 text-bad"
      }`}
      title={`vs 7-day average (${num(avg)})`}
    >
      {flat ? "≈ avg" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`}
    </div>
  );
}

/* ── trend bars ─────────────────────────────────────────────── */

function Trend({
  tone,
  values,
  target,
}: {
  tone: Tone;
  values: (number | null)[];
  target?: number;
}) {
  const t = TONES[tone];
  const max = Math.max(...values.map((v) => v ?? 0), target ?? 0, 1);

  return (
    <div className="relative flex h-10 items-end gap-[3px]">
      {target != null && (
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line"
          style={{ bottom: `${(target / max) * 100}%` }}
          aria-hidden="true"
        />
      )}
      {values.map((v, i) => {
        const last = i === values.length - 1;
        return (
          <div
            key={i}
            title={v == null ? "no data" : num(v)}
            className="bar-3d relative flex-1 rounded-[3px] transition-all"
            style={{
              height: `${v == null ? 8 : Math.max(10, (v / max) * 100)}%`,
              background:
                v == null
                  ? "color-mix(in oklab, var(--color-line) 45%, transparent)"
                  : `linear-gradient(to top, ${t.to}, ${t.from})`,
              opacity: v == null ? 1 : last ? 1 : 0.55,
            }}
          />
        );
      })}
    </div>
  );
}

/* ── footer chips ───────────────────────────────────────────── */

function Chip({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-ctl border border-line-soft bg-surface-hi/30 px-3 py-2">
      <div className="text-[0.6rem] uppercase tracking-wider text-faint">
        {label}
      </div>
      <div className="tnum mt-0.5 truncate text-sm font-medium text-ink">
        {value}
      </div>
      {hint && (
        <div className="tnum truncate text-[0.65rem] text-muted">{hint}</div>
      )}
    </div>
  );
}

/* ── log form ───────────────────────────────────────────────── */

function LogForm({ onDone }: { onDone: () => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [day, setDay] = useState<"today" | "yesterday">("today");

  return (
    <form
      className="mt-4 grid grid-cols-2 gap-2 rounded-ctl border border-line bg-surface-hi/50 p-3"
      action={(fd: FormData) => {
        const parse = (k: string) => {
          const raw = String(fd.get(k) ?? "").trim();
          if (raw === "") return null;
          const n = Number(raw);
          return Number.isFinite(n) ? n : NaN;
        };
        const steps = parse("steps");
        const hours = parse("sleep");
        const kg = parse("weight");

        if ([steps, hours, kg].some((v) => Number.isNaN(v))) {
          setErr("Numbers only.");
          return;
        }
        if (steps == null && hours == null && kg == null) {
          setErr("Fill at least one field.");
          return;
        }
        setErr(null);
        start(async () => {
          const r = await logBodyAction({
            steps,
            sleepMinutes: hours == null ? null : Math.round(hours * 60),
            weightGrams: kg == null ? null : Math.round(kg * 1000),
            day,
          });
          if (!r.ok) {
            setErr(r.error);
            return;
          }
          onDone();
        });
      }}
    >
      <div className="col-span-2 flex gap-1.5" role="group" aria-label="Which day">
        {(["today", "yesterday"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            aria-pressed={day === d}
            className={`pill flex-1 justify-center text-xs ${day === d ? "pill-selected" : ""}`}
          >
            {d === "today" ? "Today" : "Yesterday"}
          </button>
        ))}
      </div>
      <Field name="steps" label="Steps" placeholder="8200" />
      <Field name="sleep" label="Sleep hrs" placeholder="7.5" step="0.1" />
      <Field name="weight" label="Weight kg" placeholder="82.4" step="0.1" />
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending}
          className="pill pill-selected w-full justify-center disabled:opacity-60"
        >
          {pending ? "…" : "Save"}
        </button>
      </div>
      {err && (
        <p className="col-span-2 text-xs text-bad" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}

function Field({
  name,
  label,
  placeholder,
  step,
}: {
  name: string;
  label: string;
  placeholder: string;
  step?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[0.6rem] uppercase tracking-wider text-faint">
        {label}
      </span>
      <input
        name={name}
        type="number"
        inputMode="decimal"
        step={step}
        placeholder={placeholder}
        className="field"
      />
    </label>
  );
}

/* ── dates ──────────────────────────────────────────────────── */

/** "2026-09-13" → "Sat, Sep 13" */
function dayLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
