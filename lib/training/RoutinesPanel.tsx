"use client";

import { useState, useTransition } from "react";
import type { RoutineRow, RoutineExerciseRow, RoutineInput } from "./routines";
import {
  loadRoutinesAction,
  createRoutineAction,
  updateRoutineAction,
  archiveRoutineAction,
  logRoutineAction,
} from "./actions";
import { MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroup } from "./muscles";

/** Rep range as the plan states it: "5-6", "8", or "—" when untracked. */
function reps(e: RoutineExerciseRow): string {
  if (e.repLow == null) return "—";
  if (e.repHigh == null || e.repHigh === e.repLow) return String(e.repLow);
  return `${e.repLow}-${e.repHigh}`;
}

export function RoutinesPanel({
  initial,
  date,
  onLogged,
  bare = false,
}: {
  initial: RoutineRow[];
  date: string;
  onLogged: () => void;
  /** Inside a container that already titles it — drop the rule and label. */
  bare?: boolean;
}) {
  const [routines, setRoutines] = useState(initial);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [, start] = useTransition();

  const refresh = () => start(async () => setRoutines(await loadRoutinesAction()));

  return (
    <div className={bare ? "" : "mt-6 border-t border-line-soft pt-4"}>
      <div
        className={`mb-3 flex flex-wrap items-center gap-3 ${bare ? "justify-end" : "justify-between"}`}
      >
        {!bare && (
          <p className="text-[0.65rem] uppercase tracking-wider text-faint">
            Routines · {routines.length}
          </p>
        )}
        <button
          type="button"
          className={`pill ${creating ? "pill-highlight" : ""}`}
          onClick={() => {
            setCreating((v) => !v);
            setEditingId(null);
          }}
        >
          {creating ? "Cancel" : "+ Routine"}
        </button>
      </div>

      {creating && (
        <div className="mb-3">
          <RoutineEditor
            onCancel={() => setCreating(false)}
            onSave={async (input) => {
              const r = await createRoutineAction(input);
              if (!r.ok) return r.error ?? "Could not save.";
              setCreating(false);
              refresh();
              return null;
            }}
          />
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {routines.map((r) => (
          <RoutineCard
            key={r.id}
            routine={r}
            open={openId === r.id}
            editing={editingId === r.id}
            date={date}
            onToggle={() => {
              setOpenId((id) => (id === r.id ? null : r.id));
              setEditingId(null);
            }}
            onEdit={() => {
              setEditingId((id) => (id === r.id ? null : r.id));
              setOpenId(r.id);
            }}
            onSave={async (input) => {
              const res = await updateRoutineAction(r.id, input);
              if (!res.ok) return res.error ?? "Could not save.";
              setEditingId(null);
              refresh();
              return null;
            }}
            onArchive={() =>
              start(async () => {
                await archiveRoutineAction(r.id);
                setOpenId(null);
                setRoutines(await loadRoutinesAction());
              })
            }
            onLog={() =>
              start(async () => {
                await logRoutineAction(r.id, date);
                onLogged();
              })
            }
          />
        ))}
      </div>

      {routines.length === 0 && !creating && (
        <p className="py-3 text-xs text-faint">
          No routines yet. Use <strong>+ Routine</strong> to add one.
        </p>
      )}
    </div>
  );
}

/* ── one routine: collapsed summary, expands to the full plan ── */

function RoutineCard({
  routine,
  open,
  editing,
  date,
  onToggle,
  onEdit,
  onSave,
  onArchive,
  onLog,
}: {
  routine: RoutineRow;
  open: boolean;
  editing: boolean;
  date: string;
  onToggle: () => void;
  onEdit: () => void;
  onSave: (input: RoutineInput) => Promise<string | null>;
  onArchive: () => void;
  onLog: () => void;
}) {
  const top = routine.byMuscle[0]?.sets ?? 1;

  return (
    <div
      className={`routine-card ${open ? "routine-card-open" : ""}`}
      data-split={routine.splitLabel ?? ""}
    >
      {/* header — the whole bar is the toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <span className={`routine-chevron ${open ? "routine-chevron-open" : ""}`}>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <polyline points="6 3 11 8 6 13" />
          </svg>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-ink">
              {routine.name}
            </span>
            {routine.splitLabel && (
              <span className="routine-split">{routine.splitLabel}</span>
            )}
          </span>
          <span className="tnum mt-0.5 block font-mono text-[0.65rem] text-faint">
            {routine.exercises.length} exercises · {routine.totalSets} sets
            {routine.estimatedMinutes != null && (
              <> · ~{routine.estimatedMinutes}m</>
            )}
          </span>
        </span>

        {/* muscle mix, readable while collapsed */}
        <span className="routine-sparks hidden shrink-0 items-end gap-[3px] sm:flex">
          {routine.byMuscle.slice(0, 6).map((m) => (
            <span
              key={m.muscle}
              title={`${MUSCLE_LABELS[m.muscle]} · ${m.sets} sets`}
              className="routine-spark"
              style={{ height: `${Math.max(18, (m.sets / top) * 100)}%` }}
            />
          ))}
        </span>
      </button>

      {open && (
        <div className="border-t border-line-soft px-3.5 pb-3.5 pt-3">
          {editing ? (
            <RoutineEditor
              routine={routine}
              onCancel={onEdit}
              onSave={onSave}
            />
          ) : (
            <>
              {/* sets per muscle */}
              <div className="mb-3 flex flex-col gap-1.5">
                {routine.byMuscle.map((m) => (
                  <div key={m.muscle} className="flex items-center gap-2.5">
                    <span className="w-[5.5rem] shrink-0 truncate text-[0.7rem] text-muted">
                      {MUSCLE_LABELS[m.muscle]}
                    </span>
                    <span className="routine-meter">
                      <span
                        className="routine-meter-fill"
                        style={{ width: `${(m.sets / top) * 100}%` }}
                      />
                    </span>
                    <span className="tnum w-6 shrink-0 text-right font-mono text-[0.68rem] text-faint">
                      {m.sets}
                    </span>
                  </div>
                ))}
              </div>

              {/* the movements */}
              <ul className="flex flex-col">
                {routine.exercises.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-baseline justify-between gap-3 border-b border-line-soft/50 py-1.5 last:border-0"
                  >
                    <span className="min-w-0 truncate text-[0.82rem]">
                      {e.name}
                      <span className="ml-2 text-[0.6rem] uppercase tracking-wider text-faint">
                        {e.muscleGroup ? MUSCLE_LABELS[e.muscleGroup] : "cardio"}
                      </span>
                    </span>
                    <span className="tnum shrink-0 font-mono text-[0.7rem] text-muted">
                      {e.sets ?? "—"}
                      <span className="text-faint"> × </span>
                      {reps(e)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className="pill pill-selected" onClick={onLog}>
                  Log to {date}
                </button>
                <button type="button" className="pill" onClick={onEdit}>
                  Edit
                </button>
                <button
                  type="button"
                  className="ml-auto text-[0.65rem] text-faint hover:text-bad"
                  onClick={onArchive}
                >
                  Archive
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── editor ───────────────────────────────────────────────────── */

type Draft = {
  name: string;
  muscleGroup: MuscleGroup | "";
  sets: string;
  repLow: string;
  repHigh: string;
};

const BLANK: Draft = {
  name: "",
  muscleGroup: "chest",
  sets: "",
  repLow: "",
  repHigh: "",
};

function toDraft(e: RoutineExerciseRow): Draft {
  return {
    name: e.name,
    muscleGroup: e.muscleGroup ?? "",
    sets: e.sets?.toString() ?? "",
    repLow: e.repLow?.toString() ?? "",
    repHigh: e.repHigh?.toString() ?? "",
  };
}

function RoutineEditor({
  routine,
  onCancel,
  onSave,
}: {
  routine?: RoutineRow;
  onCancel: () => void;
  onSave: (input: RoutineInput) => Promise<string | null>;
}) {
  const [name, setName] = useState(routine?.name ?? "");
  const [split, setSplit] = useState(routine?.splitLabel ?? "");
  const [mins, setMins] = useState(routine?.estimatedMinutes?.toString() ?? "");
  const [rows, setRows] = useState<Draft[]>(
    routine ? routine.exercises.map(toDraft) : [{ ...BLANK }],
  );
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const patch = (i: number, p: Partial<Draft>) =>
    setRows((rs) => rs.map((r, j) => (i === j ? { ...r, ...p } : r)));

  const numOrNull = (s: string) => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  /** Moving a row is the one edit that can't be typed — sequence is the plan. */
  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <form
      className="rounded-ctl border border-line bg-surface-hi/50 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        const filled = rows.filter((r) => r.name.trim() !== "");
        if (!name.trim()) return setErr("Give the routine a name.");
        if (filled.length === 0) return setErr("Add at least one exercise.");
        setErr(null);
        start(async () => {
          const msg = await onSave({
            name: name.trim(),
            splitLabel: split.trim() || null,
            estimatedMinutes: numOrNull(mins),
            exercises: filled.map((r) => ({
              name: r.name.trim(),
              muscleGroup: r.muscleGroup === "" ? null : r.muscleGroup,
              sets: numOrNull(r.sets),
              repLow: numOrNull(r.repLow),
              repHigh: numOrNull(r.repHigh) ?? numOrNull(r.repLow),
            })),
          });
          if (msg) setErr(msg);
        });
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Chest and Bicep"
          className="field max-w-[220px]"
          aria-label="Routine name"
        />
        <input
          value={split}
          onChange={(e) => setSplit(e.target.value)}
          placeholder="Push"
          className="field max-w-[110px]"
          aria-label="Split label"
        />
        <input
          value={mins}
          onChange={(e) => setMins(e.target.value)}
          placeholder="mins"
          inputMode="numeric"
          className="field max-w-[80px]"
          aria-label="Estimated minutes"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <span className="tnum w-5 shrink-0 font-mono text-[0.62rem] text-faint">
              {i + 1}
            </span>
            <input
              value={r.name}
              onChange={(e) => patch(i, { name: e.target.value })}
              placeholder="Incline Bench Press (Smith Machine)"
              className="field min-w-[150px] flex-1 !py-1.5 !text-[0.8rem]"
              aria-label="Exercise name"
            />
            <select
              value={r.muscleGroup}
              onChange={(e) =>
                patch(i, { muscleGroup: e.target.value as MuscleGroup | "" })
              }
              className="field max-w-[125px] !py-1.5 !text-[0.8rem]"
              aria-label="Muscle group"
            >
              {MUSCLE_GROUPS.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_LABELS[m]}
                </option>
              ))}
              <option value="">Cardio / none</option>
            </select>
            <input
              value={r.sets}
              onChange={(e) => patch(i, { sets: e.target.value })}
              placeholder="sets"
              inputMode="numeric"
              className="field max-w-[58px] !py-1.5 !text-[0.8rem]"
              aria-label="Sets"
            />
            <input
              value={r.repLow}
              onChange={(e) => patch(i, { repLow: e.target.value })}
              placeholder="low"
              inputMode="numeric"
              className="field max-w-[56px] !py-1.5 !text-[0.8rem]"
              aria-label="Rep range low"
            />
            <input
              value={r.repHigh}
              onChange={(e) => patch(i, { repHigh: e.target.value })}
              placeholder="high"
              inputMode="numeric"
              className="field max-w-[56px] !py-1.5 !text-[0.8rem]"
              aria-label="Rep range high"
            />
            <span className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="px-1 text-[0.7rem] text-faint hover:text-teal disabled:opacity-25"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                className="px-1 text-[0.7rem] text-faint hover:text-teal disabled:opacity-25"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                disabled={rows.length === 1}
                className="px-1 text-[0.7rem] text-faint hover:text-bad disabled:opacity-25"
                aria-label="Remove exercise"
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
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
          {pending ? "Saving…" : "Save routine"}
        </button>
        <button type="button" className="pill" onClick={onCancel}>
          Cancel
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
