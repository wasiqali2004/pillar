"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { parseWorkoutExport, type ParsedWorkouts } from "@/lib/training/import";
import { importWorkoutsAction } from "@/lib/training/import-actions";
import { MUSCLE_LABELS } from "@/lib/training/muscles";

/**
 * A gym or cardio app's export (Strong, Hevy, Fitbod, Strava, Peloton…) into
 * Training. Read in the browser; only the sessions are sent, after a preview.
 */
export function WorkoutUpload({ steps }: { steps: ReactNode[] }) {
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  // null until the user answers, for files whose weight column doesn't say.
  const [lb, setLb] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  let parsed: ParsedWorkouts | null = null;
  let parseError: string | null = null;
  if (text !== null) {
    try {
      parsed = parseWorkoutExport(text, lb);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
  }

  async function onFile(f: File | undefined) {
    setError(null);
    setDone(null);
    if (!f) return;
    if (f.size > 25_000_000) {
      setError("That file is over 25 MB. Export a shorter date range if the app allows it.");
      return;
    }
    setFileName(f.name);
    setLb(null);
    setText(await f.text());
  }

  function save() {
    if (!parsed) return;
    const list = parsed.workouts;
    start(async () => {
      const r = await importWorkoutsAction(list);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const plural = (n: number) => `${n} workout${n === 1 ? "" : "s"}`;
      const what = [
        r.added ? `Added ${plural(r.added)}` : "",
        r.updated ? `${r.added ? "updated" : "Updated"} ${plural(r.updated)} you'd brought in before` : "",
      ]
        .filter(Boolean)
        .join(" and ");
      setDone(`${what}, ${r.from} to ${r.to}. They're in Training on your dashboard.`);
      setText(null);
      setFileName(null);
      router.refresh();
    });
  }

  const dates = parsed?.workouts.map((w) => w.localDate).sort() ?? [];
  const needsUnit = parsed?.unitUnknown && lb === null;

  return (
    <div className="mt-3 flex flex-col gap-4">
      <ol className="cx-steps">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="cx-step-n">{i + 1}</span>
            <span className="text-sm">{s}</span>
          </li>
        ))}
      </ol>

      <div>
        <label className="pill inline-flex cursor-pointer">
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          {fileName ? `↻ ${fileName}` : "Choose the CSV file"}
        </label>
        <p className="mt-1.5 text-[0.7rem] text-faint">Read on your device. Only the workouts are saved.</p>
      </div>

      {parseError && <p className="text-sm text-bad">{parseError}</p>}

      {parsed && (
        <div className="rounded-[14px] border border-line-soft p-4">
          {needsUnit ? (
            <>
              <p className="text-sm font-semibold">Are the weights in that file in pounds or kilograms?</p>
              <p className="mt-1 text-xs text-faint">The file doesn&apos;t say. It&apos;s whatever unit you use in the app.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="pill" onClick={() => setLb(true)}>
                  Pounds (lb)
                </button>
                <button type="button" className="pill" onClick={() => setLb(false)}>
                  Kilograms (kg)
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-muted">Check it looks right</p>
              <p className="mt-2 text-sm">
                <b>{parsed.workouts.length}</b> {parsed.kind === "cardio" ? "activities" : "workouts"}, {dates[0]} to{" "}
                {dates.at(-1)}
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-[0.75rem] text-muted">
                {[...parsed.workouts]
                  .sort((a, b) => b.localDate.localeCompare(a.localDate))
                  .slice(0, 3)
                  .map((w) => (
                    <li key={w.key}>
                      <span className="font-mono text-faint">{w.localDate}</span> <b className="text-ink">{w.title}</b>
                      {" · "}
                      {w.exercises
                        .slice(0, 3)
                        .map((e) => `${e.name} (${MUSCLE_LABELS[e.muscleGroup]})`)
                        .join(", ")}
                      {w.exercises.length > 3 ? ` +${w.exercises.length - 3}` : ""}
                    </li>
                  ))}
              </ul>
              {parsed.unitUnknown && (
                <button type="button" className="mt-2 text-xs text-teal hover:underline" onClick={() => setLb(null)}>
                  Weights in {lb ? "pounds" : "kilograms"} · change
                </button>
              )}
              <button type="button" className="ob-next mt-4" onClick={save} disabled={pending}>
                {pending ? "Adding…" : `Add ${parsed.workouts.length} ${parsed.kind === "cardio" ? "activities" : "workouts"}`}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-bad">{error}</p>}
      {done && <p className="text-sm text-teal">{done}</p>}
    </div>
  );
}
