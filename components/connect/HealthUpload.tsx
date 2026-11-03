"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAX_FILE_BYTES, parseHealthExport, type ParsedHealth } from "@/lib/health/import";
import { importHealthAction } from "@/lib/health/import-actions";

/**
 * Drop a Fitbit / Google Takeout export in and get steps, calories and sleep.
 *
 * Reading happens here in the browser so the rest of the export — heart rate,
 * location, profile — is never uploaded. Only one line per day is sent.
 */
export function HealthUpload() {
  const router = useRouter();
  const [parsed, setParsed] = useState<ParsedHealth | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFiles(list: FileList | null) {
    setError(null);
    setDone(null);
    setParsed(null);
    if (!list || list.length === 0) return;

    const files = [...list];
    const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is very large. Leave the heart-rate files out and pick the steps, calories and sleep ones.`);
      return;
    }

    setReading(true);
    try {
      const texts = await Promise.all(
        files.map(async (f) => ({ name: f.name, text: await f.text() })),
      );
      const result = parseHealthExport(texts);
      if (result.rows.length === 0) {
        setError(
          "No steps, calories or sleep found in those files. In the export folder look for files whose names start with steps, calories or sleep.",
        );
      } else {
        setParsed(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(false);
    }
  }

  function save() {
    if (!parsed) return;
    setError(null);
    start(async () => {
      const r = await importHealthAction(parsed.rows);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(`Added ${r.days} day${r.days === 1 ? "" : "s"}, ${r.from} to ${r.to}.`);
      setParsed(null);
      router.refresh();
    });
  }

  const used = parsed?.files.filter((f) => f.days > 0) ?? [];
  const ignored = parsed?.files.filter((f) => f.days === 0) ?? [];
  const counts = parsed
    ? {
        steps: parsed.rows.filter((r) => r.steps != null).length,
        calories: parsed.rows.filter((r) => r.calories != null).length,
        sleep: parsed.rows.filter((r) => r.sleepMinutes != null).length,
      }
    : null;
  const range = parsed?.rows.length
    ? [parsed.rows[0].date, parsed.rows[parsed.rows.length - 1].date]
    : null;

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-muted">1. Download your data</p>
        <p className="mt-1 text-xs text-faint">
          In the Fitbit app: <b>Account → Manage Data → Export Your Data</b>, or use{" "}
          <a href="https://takeout.google.com" target="_blank" rel="noreferrer" className="text-teal hover:underline">
            Google Takeout
          </a>{" "}
          and tick Fitbit. The download arrives by email as a .zip.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted">2. Unzip it, then choose the steps, calories and sleep files</p>
        <p className="mt-1 text-xs text-faint">
          Select as many as you like at once. Everything is read on your device — only one line per day (steps,
          calories, minutes asleep) is saved.
        </p>
        <label className="pill mt-2 inline-flex cursor-pointer">
          <input
            type="file"
            accept=".json,.csv,application/json,text/csv"
            multiple
            className="sr-only"
            onChange={(e) => onFiles(e.target.files)}
          />
          {reading ? "Reading…" : "Choose files"}
        </label>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      {parsed && counts && range && (
        <div className="rounded-[14px] border border-line-soft p-4">
          <p className="text-xs font-semibold text-muted">3. Check it looks right</p>
          <p className="mt-2 text-sm">
            <b>{parsed.rows.length}</b> days, {range[0]} to {range[1]}
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span>
              Steps <b className="text-teal">{counts.steps}</b> days
            </span>
            <span>
              Calories <b className="text-teal">{counts.calories}</b> days
            </span>
            <span>
              Sleep <b className="text-teal">{counts.sleep}</b> nights
            </span>
          </div>

          <ul className="mt-3 flex flex-col gap-1 font-mono text-[0.72rem] text-muted">
            {parsed.rows.slice(-4).map((r) => (
              <li key={r.date} className="flex justify-between gap-3">
                <span>{r.date}</span>
                <span>
                  {r.steps != null && `${r.steps.toLocaleString()} steps`}
                  {r.calories != null && ` · ${r.calories.toLocaleString()} kcal`}
                  {r.sleepMinutes != null &&
                    ` · ${Math.floor(r.sleepMinutes / 60)}h ${r.sleepMinutes % 60}m asleep`}
                </span>
              </li>
            ))}
          </ul>

          {used.length > 0 && (
            <p className="mt-3 text-[0.7rem] text-faint">
              Read: {used.map((f) => `${f.name} (${f.kind})`).join(", ")}
            </p>
          )}
          {ignored.length > 0 && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[0.7rem] text-faint hover:text-muted">
                {ignored.length} file{ignored.length === 1 ? "" : "s"} skipped
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5 text-[0.68rem] text-faint">
                {ignored.slice(0, 20).map((f) => (
                  <li key={f.name}>
                    {f.name} — {f.skipped}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <button type="button" className="ob-next mt-4" onClick={save} disabled={pending}>
            {pending ? "Adding…" : `Add ${parsed.rows.length} days`}
          </button>
        </div>
      )}

      {done && <p className="text-sm text-teal">{done}</p>}
    </div>
  );
}
