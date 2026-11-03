"use client";

import { useOptimistic, useTransition, useState } from "react";
import type { HabitsData, HabitStatus } from "./queries";
import {
  toggleHabitAction,
  createHabitAction,
  updateHabitAction,
  deleteHabitAction,
} from "../actions";
import { Tile3D } from "@/components/Tile3D";

type Cadence = HabitStatus["cadence"];

const CADENCES: { value: Cadence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "x_per_week", label: "× / week" },
  { value: "weekly", label: "Weekly" },
];

export function HabitsTile({ data }: { data: HabitsData }) {
  const [optimistic, applyOptimistic] = useOptimistic(
    data,
    (state: HabitsData, habitId: number): HabitsData => {
      const items = state.items.map((h) => {
        if (h.id !== habitId) return h;
        const doneToday = !h.doneToday;
        return {
          ...h,
          doneToday,
          streak:
            h.cadence === "daily"
              ? doneToday
                ? h.streak + 1
                : Math.max(0, h.streak - 1)
              : h.streak,
          weekCount: Math.max(0, h.weekCount + (doneToday ? 1 : -1)),
          strip: [...h.strip.slice(0, -1), doneToday],
        };
      });
      return {
        ...state,
        items,
        doneCount: items.filter((i) => i.doneToday).length,
      };
    },
  );

  const [editMode, setEditMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  function toggle(habitId: number) {
    startTransition(async () => {
      applyOptimistic(habitId);
      await toggleHabitAction(habitId);
    });
  }

  const empty = optimistic.items.length === 0;
  const left = optimistic.totalCount - optimistic.doneCount;

  return (
    <Tile3D>
      <div className="tile gap-0">
        <div className="tile-head flex shrink-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ProgressRing
              done={optimistic.doneCount}
              total={optimistic.totalCount}
            />
            <div className="min-w-0">
              <h2 className="tile-title">Today</h2>
              <p className="tile-sub truncate">
                {empty
                  ? "No habits yet"
                  : left === 0
                    ? `All done · ${dayLabel(optimistic.today)}`
                    : `${left} to go · ${dayLabel(optimistic.today)}`}
              </p>
            </div>
          </div>

          {/* A visible mode rather than hover-only icons, so editing works on
              touch and is findable without knowing where to mouse over. */}
          <button
            type="button"
            onClick={() => {
              setEditMode((v) => !v);
              setAdding(false);
            }}
            aria-pressed={editMode}
            className={`pill shrink-0 ${editMode ? "pill-selected" : ""}`}
          >
            {editMode ? "Done" : "Edit"}
          </button>
        </div>

        {/* overflow-x-hidden: a long name must truncate, never scroll the tile sideways. */}
        <div className="tile-body overflow-x-hidden">
          <ul className="mt-4 flex flex-col gap-1.5">
            {optimistic.items.map((h) => (
              <HabitRow
                key={h.id}
                habit={h}
                editMode={editMode}
                onToggle={() => toggle(h.id)}
              />
            ))}
          </ul>

          {adding ? (
            <HabitForm mode="add" onClose={() => setAdding(false)} />
          ) : (
            (editMode || empty) && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-ctl border border-dashed border-line px-3 py-2.5 text-xs text-muted transition-colors hover:border-teal hover:text-teal"
              >
                <span className="text-base leading-none">+</span> Add habit
              </button>
            )
          )}
        </div>
      </div>
    </Tile3D>
  );
}

/* ── header ring ────────────────────────────────────────────── */

function ProgressRing({ done, total }: { done: number; total: number }) {
  const size = 46;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total === 0 ? 0 : done / total;
  const complete = total > 0 && done === total;

  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${done} of ${total} habits done`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="habit-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-teal)" />
            <stop offset="100%" stopColor="var(--color-violet)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-line)"
          strokeOpacity={0.55}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#habit-ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          opacity={frac === 0 ? 0 : 1}
          style={{
            transition: "stroke-dashoffset 0.5s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </svg>
      <span
        className={`tnum absolute font-mono text-[0.72rem] font-semibold ${
          complete ? "grad-text" : "text-ink"
        }`}
      >
        {done}/{total}
      </span>
    </div>
  );
}

/* ── rows ───────────────────────────────────────────────────── */

function HabitRow({
  habit,
  editMode,
  onToggle,
}: {
  habit: HabitStatus;
  editMode: boolean;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <li>
        <HabitForm mode="edit" habit={habit} onClose={() => setEditing(false)} />
      </li>
    );
  }

  const done = habit.doneToday;

  return (
    <li
      className={`rounded-ctl border transition-colors ${
        done && !editMode
          ? "border-teal/25 bg-teal/[0.06]"
          : "border-line/50 bg-surface-hi/25 hover:border-line"
      } ${pending ? "opacity-50" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={editMode ? () => setEditing(true) : onToggle}
          aria-pressed={editMode ? undefined : done}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {editMode ? <EditDot /> : <CheckDot done={done} />}

          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-sm transition-colors ${
                done && !editMode
                  ? "text-muted line-through decoration-teal/50"
                  : "text-ink"
              }`}
            >
              {habit.name}
            </span>
            <span className="mt-0.5 block truncate text-[0.7rem]">
              <Meta habit={habit} />
            </span>
          </span>
        </button>

        {editMode ? (
          <div className="flex shrink-0 items-center gap-1">
            <IconButton label="Edit habit" onClick={() => setEditing(true)}>
              <path d="M9.5 2.5l2 2L5 11H3V9z" />
            </IconButton>
            <IconButton
              label="Delete habit"
              tone="bad"
              onClick={() => setConfirmDelete((v) => !v)}
            >
              <path d="M3 4h8M5.5 4V3h3v1M4.5 4l.5 7h4l.5-7" />
            </IconButton>
          </div>
        ) : (
          <WeekDots days={habit.strip.slice(-7)} />
        )}
      </div>

      {confirmDelete && editMode && (
        <div className="flex items-center justify-between gap-2 border-t border-line/50 px-3 py-2">
          <span className="truncate text-xs text-muted">
            Remove this habit? History is kept.
          </span>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="pill !px-2.5 !py-1"
            >
              Keep
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await deleteHabitAction(habit.id);
                })
              }
              className="pill !border-bad/60 !px-2.5 !py-1 !text-bad"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Meta({ habit }: { habit: HabitStatus }) {
  if (habit.cadence === "daily") {
    return habit.streak > 0 ? (
      <span className="text-teal">🔥 {habit.streak}-day streak</span>
    ) : (
      <span className="text-faint">Daily · start a streak</span>
    );
  }
  if (habit.cadence === "weekly") {
    return habit.weekCount > 0 ? (
      <span className="text-teal">Weekly · done this week</span>
    ) : (
      <span className="text-faint">Weekly</span>
    );
  }
  const hit = habit.weekCount >= habit.targetCount;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={hit ? "text-teal" : "text-muted"}>
        {habit.weekCount}/{habit.targetCount} this week
      </span>
      <Pips count={habit.weekCount} target={habit.targetCount} />
    </span>
  );
}

/** Progress toward an x-per-week target, one pip per required day. */
function Pips({ count, target }: { count: number; target: number }) {
  return (
    <span className="inline-flex gap-[3px]" aria-hidden="true">
      {Array.from({ length: target }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-3 rounded-full ${i < count ? "grad" : "bg-line/70"}`}
        />
      ))}
    </span>
  );
}

/** Last 7 days, oldest → newest. Today is ringed. */
function WeekDots({ days }: { days: boolean[] }) {
  return (
    <span
      className="flex shrink-0 items-center gap-[5px]"
      title="Last 7 days"
      aria-label={`${days.filter(Boolean).length} of the last 7 days`}
    >
      {days.map((hit, i) => {
        const isToday = i === days.length - 1;
        return (
          <span
            key={i}
            className={`h-[7px] w-[7px] rounded-full transition-colors ${
              hit
                ? "bg-teal shadow-[0_0_6px_rgba(47,225,196,0.45)]"
                : "bg-line/70"
            } ${isToday ? "ring-1 ring-ink/40 ring-offset-1 ring-offset-surface" : ""}`}
          />
        );
      })}
    </span>
  );
}

function CheckDot({ done }: { done: boolean }) {
  return (
    <span
      className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2 transition-all ${
        done
          ? "grad-135 scale-105 border-transparent shadow-[0_0_12px_rgba(47,225,196,0.35)]"
          : "border-line bg-transparent hover:border-teal"
      }`}
    >
      {done && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.5 6.4 4.8 8.7 9.5 3.6"
            fill="none"
            stroke="#14213a"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

/** Stands in for the check while editing, so a tap can't log by accident. */
function EditDot() {
  return (
    <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2 border-dashed border-line text-[0.7rem] text-faint">
      ✎
    </span>
  );
}

function IconButton({
  label,
  onClick,
  tone = "teal",
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: "teal" | "bad";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-7 w-7 place-items-center rounded-full border border-line/60 text-muted transition-colors ${
        tone === "bad"
          ? "hover:border-bad hover:text-bad"
          : "hover:border-teal hover:text-teal"
      }`}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

/* ── add / edit ─────────────────────────────────────────────── */

function HabitForm({
  mode,
  habit,
  onClose,
}: {
  mode: "add" | "edit";
  habit?: HabitStatus;
  onClose: () => void;
}) {
  const [name, setName] = useState(habit?.name ?? "");
  const [cadence, setCadence] = useState<Cadence>(habit?.cadence ?? "daily");
  const [targetCount, setTargetCount] = useState(
    habit?.cadence === "x_per_week" ? habit.targetCount : 3,
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the habit a name.");
      return;
    }
    // Only x_per_week has a meaningful count; the others are always 1.
    const payload = {
      name: name.trim(),
      cadence,
      targetCount: cadence === "x_per_week" ? targetCount : 1,
    };

    start(async () => {
      const result =
        mode === "edit" && habit
          ? await updateHabitAction(habit.id, payload)
          : await createHabitAction(payload);
      if (result.ok) onClose();
      else setError(result.error || "Could not save that habit.");
    });
  };

  return (
    <form
      onSubmit={submit}
      className="mt-1.5 flex flex-col gap-3 rounded-ctl border border-teal/30 bg-surface-hi/50 p-3"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        placeholder="e.g. Read 10 pages"
        aria-label="Habit name"
        className="field !py-2 !text-sm"
        disabled={pending}
        autoFocus
      />

      <div
        role="radiogroup"
        aria-label="How often"
        className="grid grid-cols-3 gap-1 rounded-full border border-line/60 p-1"
      >
        {CADENCES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={cadence === c.value}
            onClick={() => setCadence(c.value)}
            disabled={pending}
            className={`truncate rounded-full px-2 py-1.5 text-[0.72rem] font-medium transition-colors ${
              cadence === c.value
                ? "grad text-[#10202c]"
                : "text-muted hover:text-ink"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {cadence === "x_per_week" && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">Days per week</span>
          <div className="flex items-center gap-2">
            <Stepper
              label="Fewer days"
              onClick={() => setTargetCount((n) => Math.max(1, n - 1))}
              disabled={pending || targetCount <= 1}
            >
              −
            </Stepper>
            <span className="tnum w-5 text-center font-mono text-sm text-ink">
              {targetCount}
            </span>
            <Stepper
              label="More days"
              onClick={() => setTargetCount((n) => Math.min(7, n + 1))}
              disabled={pending || targetCount >= 7}
            >
              +
            </Stepper>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-bad" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="pill flex-1"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="pill pill-selected flex-1 disabled:opacity-60"
        >
          {pending ? "Saving…" : mode === "edit" ? "Save" : "Add habit"}
        </button>
      </div>
    </form>
  );
}

function Stepper({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-7 w-7 place-items-center rounded-full border border-line text-sm text-muted transition-colors hover:border-teal hover:text-teal disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
    >
      {children}
    </button>
  );
}

/** "2026-09-13" → "Sun, Sep 13" */
function dayLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
