"use client";

import { useState, useTransition } from "react";
import type { SleepData, SleepNight } from ".";
import { scoreBand } from "./bands";
import { logSleepAction } from "../actions";
import { Tile, Empty } from "@/components/ui";

/** 9h is the top of the chart — taller than any night worth drawing. */
const CEILING_MINUTES = 9 * 60;

function hhmm(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function SleepTile({ data }: { data: SleepData }) {
  const [logging, setLogging] = useState(false);

  const scoreTone =
    data.lastScore == null
      ? "text-muted"
      : {
          excellent: "text-teal",
          good: "text-teal",
          fair: "text-warn",
          poor: "text-bad",
        }[scoreBand(data.lastScore)];

  return (
    <Tile
      title="Sleep"
      sub={
        data.logged === 0
          ? "No nights logged"
          : `${data.logged} of 14 nights · avg ${hhmm(data.avgMinutes)}`
      }
      right={
        <button
          type="button"
          className={`pill ${logging ? "pill-highlight" : ""}`}
          onClick={() => setLogging((v) => !v)}
        >
          {logging ? "Close" : "Log"}
        </button>
      }
    >
      {logging && <LogSleepForm onDone={() => setLogging(false)} />}

      {data.logged === 0 && !logging ? (
        <Empty>
          Nothing logged yet — use <strong>Log</strong> to add last night&apos;s
          hours and Fitbit sleep score.
        </Empty>
      ) : (
        <>
          {/* headline: last night */}
          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="tnum text-2xl font-semibold leading-none text-ink [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
                {hhmm(data.lastMinutes)}
              </div>
              <div className="mt-1 text-[0.65rem] uppercase tracking-wider text-faint">
                Last night
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className={`tnum text-2xl font-semibold leading-none ${scoreTone}`}>
                {data.lastScore ?? "—"}
              </div>
              <div className="mt-1 text-[0.65rem] uppercase tracking-wider text-faint">
                Score
              </div>
            </div>
          </div>

          {/* 14 nights */}
          <div className="mt-4 flex h-20 items-end gap-[3px]">
            {data.nights.map((n) => (
              <NightBar key={n.date} night={n} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[0.58rem] text-faint">
            <span>{data.nights[0]?.weekday}</span>
            <span>{data.nights.at(-1)?.weekday}</span>
          </div>

          {/* footer stats */}
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-line-soft pt-2.5">
            <span className="tnum text-[0.68rem] text-muted">
              avg score{" "}
              <span className="font-mono text-ink">{data.avgScore ?? "—"}</span>
            </span>
            <span className="tnum text-[0.68rem] text-muted">
              7h streak{" "}
              <span
                className={`font-mono ${
                  data.streak7h > 0 ? "text-teal" : "text-faint"
                }`}
              >
                {data.streak7h}
              </span>
            </span>
          </div>
        </>
      )}
    </Tile>
  );
}

/** One night: bar height is duration, colour is the score band. */
function NightBar({ night }: { night: SleepNight }) {
  const { minutes, score } = night;

  if (minutes == null && score == null) {
    return (
      <div
        className="flex-1 rounded-sm bg-line/30"
        style={{ height: "6px" }}
        title={`${night.date} · no data`}
      />
    );
  }

  const pct =
    minutes == null
      ? 12
      : Math.max(10, Math.min(100, (minutes / CEILING_MINUTES) * 100));

  const band = score == null ? "none" : scoreBand(score);

  return (
    <div
      className={`sleep-bar sleep-bar-${band} flex-1`}
      style={{ height: `${pct}%` }}
      title={`${night.weekday} ${night.date} · ${
        minutes == null ? "no duration" : hhmm(minutes)
      }${score == null ? "" : ` · score ${score}`}`}
    />
  );
}

/* ── log form ─────────────────────────────────────────────────── */

function LogSleepForm({ onDone }: { onDone: () => void }) {
  const [hours, setHours] = useState("");
  const [score, setScore] = useState("");
  const [date, setDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="mt-3 rounded-ctl border border-line bg-surface-hi/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const h = hours.trim() === "" ? null : Number(hours);
        const s = score.trim() === "" ? null : Number(score);
        if (h == null && s == null) return setErr("Enter hours or a score.");
        if (h != null && !Number.isFinite(h)) return setErr("Hours must be a number.");
        if (s != null && !Number.isFinite(s)) return setErr("Score must be a number.");
        setErr(null);
        start(async () => {
          const r = await logSleepAction({
            date: date.trim() || undefined,
            minutes: h == null ? null : Math.round(h * 60),
            score: s,
          });
          if (!r.ok) return setErr(r.error ?? "Could not save.");
          setHours("");
          setScore("");
          setDate("");
          onDone();
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="hours"
          inputMode="decimal"
          className="field max-w-[80px] !py-1.5 !text-xs"
          aria-label="Hours slept"
        />
        <input
          value={score}
          onChange={(e) => setScore(e.target.value)}
          placeholder="score"
          inputMode="numeric"
          className="field max-w-[80px] !py-1.5 !text-xs"
          aria-label="Fitbit sleep score"
        />
        <input
          value={date}
          onChange={(e) => setDate(e.target.value)}
          placeholder="today"
          className="field max-w-[110px] !py-1.5 !text-xs"
          aria-label="Date (YYYY-MM-DD), blank for last night"
        />
        <button
          type="submit"
          disabled={pending}
          className="pill pill-selected disabled:opacity-60"
        >
          {pending ? "…" : "Save"}
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
