"use client";

import { useTransition, useState } from "react";
import type { GoalsData, GoalRow } from ".";
import { Tile, Empty } from "@/components/ui";
import { money, moneyCompact, num } from "@/lib/format";
import {
  createGoalAction,
  deleteGoalAction,
  stepGoalAction,
  updateGoalAction,
} from "../actions";

const PERIOD_LABEL = {
  week: "this week",
  month: "this month",
  year: "this year",
  once: "overall",
} as const;

const MONEY = new Set<GoalRow["metric"]>(["business_revenue", "income", "spend"]);

/** A sensible starting target for each kind, so switching kinds doesn't leave "1000 prayers". */
const DEFAULT_TARGET: Partial<Record<GoalRow["metric"], string>> = {
  business_revenue: "1000",
  income: "1000",
  spend: "500",
  workouts: "12",
  prayers: "150",
  surahs_memorized: "1",
  steps_avg: "8000",
  custom: "5",
};

/** Everything is a monthly goal except your own, which is counted by hand toward one total. */
const periodFor = (metric: GoalRow["metric"]) => (metric === "custom" ? "once" : "month");

/** Money is stored in cents and weight in grams; the inputs speak dollars and kg. */
function toInput(goal: GoalRow): string {
  if (goal.isMoney) return String(goal.target / 100);
  if (goal.metric === "weight") return String(goal.target / 1000);
  return String(goal.target);
}

function fromInput(metric: GoalRow["metric"], value: number): number {
  if (MONEY.has(metric)) return Math.round(value * 100);
  if (metric === "weight") return Math.round(value * 1000);
  return value;
}

export function GoalsTile({ data }: { data: GoalsData }) {
  const [showForm, setShowForm] = useState(false);
  const [, startTransition] = useTransition();

  const onTrack = data.rows.filter((g) => g.onTrack).length;

  return (
    <Tile
      title="Goals"
      sub={`${onTrack} of ${data.rows.length} on pace`}
      right={
        <div className="tnum grad-text text-lg font-semibold leading-none">
          {onTrack}/{data.rows.length}
        </div>
      }
    >
      {showForm && <AddGoalForm onClose={() => setShowForm(false)} />}

      {data.rows.length === 0 && !showForm && (
        <Empty>
          No goals yet. Click &quot;+ Add goal&quot; to get started.
        </Empty>
      )}

      {data.rows.length > 0 && (
        <div className="mt-4 flex flex-col gap-3.5">
          {data.rows.map((g) => (
            <GoalBar
              key={g.id}
              goal={g}
              onDelete={(id) => {
                startTransition(async () => {
                  await deleteGoalAction(id);
                });
              }}
            />
          ))}
        </div>
      )}

      <button
        onClick={() => setShowForm(!showForm)}
        className="mt-4 w-full rounded-ctl border border-line px-3 py-2 text-xs text-muted transition-colors hover:border-teal hover:text-teal"
      >
        {showForm ? "Cancel" : "+ Add goal"}
      </button>
    </Tile>
  );
}

function fmt(value: number, goal: GoalRow): string {
  if (goal.isMoney) return money(value);
  if (goal.metric === "weight") return `${(value / 1000).toFixed(1)} kg`;
  return num(Math.round(value));
}

function fmtTarget(goal: GoalRow): string {
  if (goal.isMoney) return moneyCompact(goal.target);
  if (goal.metric === "weight") return `${(goal.target / 1000).toFixed(1)} kg`;
  return num(goal.target);
}

function AddGoalForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<GoalRow["metric"]>("business_revenue");
  const [targetValue, setTargetValue] = useState("1000");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Goal title is required");
      return;
    }
    if (!targetValue || isNaN(Number(targetValue))) {
      setError("Target value must be a number");
      return;
    }

    start(async () => {
      const result = await createGoalAction({
        title: title.trim(),
        metric,
        targetValue: fromInput(metric, Number(targetValue)),
        period: periodFor(metric),
        direction: metric === "spend" ? "at_most" : "at_least",
      });
      if (result.ok) {
        setTitle("");
        setTargetValue(DEFAULT_TARGET[metric] ?? "1");
        setError(null);
        onClose();
      } else {
        setError(result.error || "Failed to create goal");
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 rounded-ctl border border-line bg-surface-hi/50 p-3"
    >
      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder="Goal title (e.g., $5k months, read 4 books)"
          aria-label="Goal title"
          className="field !py-2 !text-sm"
          disabled={pending}
        />

        <div className="flex gap-2">
          <select
            value={metric}
            onChange={(e) => {
              const next = e.target.value as GoalRow["metric"];
              setMetric(next);
              setTargetValue(DEFAULT_TARGET[next] ?? "1");
            }}
            aria-label="What to track"
            className="field !py-2 !text-sm flex-1"
            disabled={pending}
          >
            <option value="business_revenue">Business Revenue ($)</option>
            <option value="income">Income ($)</option>
            <option value="spend">Spending Limit ($)</option>
            <option value="workouts">Workouts</option>
            <option value="prayers">Prayers</option>
            <option value="surahs_memorized">Surahs memorized</option>
            <option value="steps_avg">Avg Steps</option>
            <option value="custom">Something else (I&apos;ll count it)</option>
          </select>

          <input
            type="number"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder={metric === "custom" ? "Target" : "Monthly target"}
            aria-label={metric === "custom" ? "Target" : "Monthly target"}
            className="field !py-2 !text-sm w-28"
            disabled={pending}
          />
        </div>

        {error && <p className="text-xs text-bad">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="pill pill-selected disabled:opacity-60 flex-1"
          >
            {pending ? "Adding..." : "Add"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="pill pill-inactive disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

function GoalBar({
  goal,
  onDelete,
}: {
  goal: GoalRow;
  onDelete: (id: number) => void;
}) {
  const [showDelete, setShowDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [target, setTarget] = useState(toInput(goal));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const atMost = goal.direction === "at_most";
  const fill = goal.onTrack ? "grad" : atMost ? "bg-bad" : "bg-warn";

  const openEdit = () => {
    setTitle(goal.title);
    setTarget(toInput(goal));
    setError(null);
    setShowDelete(false);
    setEditing(true);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(target);
    if (!title.trim()) return setError("Title is required");
    if (!target || !Number.isFinite(n) || n <= 0) {
      return setError("Target must be a number above zero");
    }
    start(async () => {
      const r = await updateGoalAction(goal.id, {
        title: title.trim(),
        targetValue: fromInput(goal.metric, n),
        // Every tracked goal is a monthly one now, including any older weekly/one-off ones.
        period: periodFor(goal.metric),
      });
      if (r.ok) setEditing(false);
      else setError(r.error ?? "Failed to save");
    });
  };

  if (editing) {
    return (
      <form
        onSubmit={save}
        className="rounded-ctl border border-line bg-surface-hi/50 p-3"
      >
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            aria-label="Goal title"
            className="field !py-2 !text-sm"
            disabled={pending}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setError(null);
              }}
              aria-label="Monthly target"
              className="field !py-2 !text-sm w-28"
              disabled={pending}
            />
            <span className="text-xs text-faint">
              {goal.isMoney ? "$" : goal.metric === "weight" ? "kg" : (goal.unit ?? "")}{" "}
              {goal.metric === "custom" ? "in total" : "per month"}
            </span>
          </div>
          {error && <p className="text-xs text-bad">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="pill pill-selected flex-1 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="pill pill-inactive disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="group mb-1 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm">{goal.title}</span>
        <div className="flex items-center gap-2 shrink-0">
          {goal.metric === "custom" && (
            <span className="flex gap-1">
              {([-1, 1] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={pending || (d === -1 && goal.current <= 0)}
                  onClick={() => start(async () => void (await stepGoalAction(goal.id, d)))}
                  className="grid h-5 w-5 place-items-center rounded-[4px] border border-line text-xs text-muted transition-colors hover:border-teal hover:text-teal disabled:opacity-40"
                  aria-label={d === 1 ? `Add one to ${goal.title}` : `Take one off ${goal.title}`}
                >
                  {d === 1 ? "+" : "−"}
                </button>
              ))}
            </span>
          )}
          <span className="tnum font-mono text-xs">
            <span className={goal.onTrack ? "text-teal" : "text-warn"}>
              {fmt(goal.current, goal)}
            </span>
            <span className="text-faint"> / {fmtTarget(goal)}</span>
          </span>
          <button
            type="button"
            onClick={openEdit}
            className="rounded px-1.5 py-0.5 text-xs text-faint opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 hover:text-teal"
            title="Edit goal"
            aria-label="Edit goal"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={() => setShowDelete(!showDelete)}
            className="rounded px-1.5 py-0.5 text-xs text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-bad"
            title="Delete goal"
          >
            ✕
          </button>
        </div>
      </div>

      {showDelete && (
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              onDelete(goal.id);
              setShowDelete(false);
            }}
            className="text-xs text-bad hover:text-bad/80"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setShowDelete(false)}
            className="text-xs text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
      )}

      {/* The pace marker is what turns a bar into a judgement. */}
      <div className="relative">
        <div className="track">
          {goal.pct > 0 && (
            <div
              className={`track-fill ${fill}`}
              style={{ width: `${goal.pct}%` }}
            />
          )}
        </div>
        {goal.pacePct != null && (
          <span
            aria-hidden="true"
            title="Where you'd need to be today"
            className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink/45"
            style={{ left: `${Math.min(100, goal.pacePct)}%` }}
          />
        )}
      </div>

      <div className="mt-1 flex justify-between font-mono text-[0.62rem] text-faint">
        <span>
          {PERIOD_LABEL[goal.period]}
          {atMost ? " · stay under" : ""}
        </span>
        {/* A "once" goal has no period to be behind in — show progress instead. */}
        <span className={goal.onTrack ? "text-teal" : "text-warn"}>
          {goal.pacePct == null
            ? goal.onTrack
              ? "complete"
              : `${Math.round(goal.pct)}%`
            : goal.onTrack
              ? "on pace"
              : atMost
                ? "over pace"
                : "behind"}
        </span>
      </div>
    </div>
  );
}
