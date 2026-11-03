"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { DeenData, SurahRow, QuranData } from ".";
import type { PrayersData } from "../prayers";
import type { PrayerName } from "@/lib/db/schema";
import {
  togglePrayerAction,
  cycleSurahAction,
  addSurahAction,
  removeSurahAction,
} from "../actions";
import Link from "next/link";
import { Tile3D } from "@/components/Tile3D";
import { Bar } from "@/components/ui";
import { time, relative, num } from "@/lib/format";
import { ALL_SURAHS } from "./surahs";
import { PrayerSetupPrompt } from "../prayers/SetupPrompt";
import { TreeTab } from "@/components/tree/TreeTab";

/**
 * One tap marks a surah done, a second drops it to still-memorizing, a third
 * clears it. Memorized comes first because that is the common case — most taps
 * are logging a surah he has finished, not flagging one in progress.
 *
 * Must stay identical to NEXT in ./index.ts: this drives the optimistic
 * update, that one the write, and a mismatch makes the tile flicker to a
 * different status than the one it saves.
 */
const NEXT_STATUS = {
  not_started: "memorized",
  memorized: "learning",
  learning: "not_started",
} as const;

export function DeenTile({ data }: { data: DeenData }) {
  const [editing, setEditing] = useState(false);

  return (
    <Tile3D>
      <div className="tile deen-tile">
        <TreeTab full={data.prayers.doneCount === 5} />
        <div className="tile-head shrink-0">
          <h2 className="tile-title">Deen</h2>
        </div>

        <div className="tile-body">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 sm:grid-cols-2">
            <PrayersPanel data={data.prayers} />
            <QuranPanel
              data={data.quran}
              editing={editing}
              onEditToggle={() => setEditing((e) => !e)}
            />
          </div>
        </div>
      </div>
    </Tile3D>
  );
}

/* ── Prayers panel ────────────────────────────────────────────── */

function PrayersPanel({ data }: { data: PrayersData }) {
  const [state, apply] = useOptimistic(
    data,
    (s: PrayersData, prayer: string): PrayersData => {
      const rows = s.rows.map((r) =>
        r.name === prayer ? { ...r, prayed: !r.prayed } : r,
      );
      return { ...s, rows, doneCount: rows.filter((r) => r.prayed).length };
    },
  );
  const [, startTransition] = useTransition();

  const next = state.rows.find((r) => r.isNext);

  if (!data.configured) {
    return (
      <div className="flex min-h-0 flex-col">
        <h3 className="text-[0.82rem] font-semibold text-ink">Prayers</h3>
        <PrayerSetupPrompt />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Location/method/madhab live in the tooltip rather than a footer
              line: they never change, and the row they used to occupy is
              worth more as another visible prayer. */}
          <h3
            className="cursor-help text-[0.82rem] font-semibold text-ink"
            title={`${state.place} · ${state.method} · ${state.madhab}`}
          >
            Prayers
          </h3>
          <p className="text-[0.7rem] text-faint" suppressHydrationWarning>
            {next
              ? `${next.label} ${relative(new Date(next.at))}`
              : "All prayers passed"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="tnum grad-text text-lg font-semibold leading-none">
            {state.doneCount}/5
          </div>
          {state.streak > 0 && (
            <div className="tnum mt-1 text-[0.7rem] text-teal">
              {state.streak}d full
            </div>
          )}
        </div>
      </div>

      <div className="mt-2">
        <Bar pct={(state.doneCount / 5) * 100} />
      </div>

      {/* Scrolls like the memorization list beside it: the tile is height-
          locked to the dashboard row, so without this the last prayers of the
          day are simply clipped off rather than reachable. */}
      <ul className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 deen-scroll">
        {state.rows.map((r) => (
          <li key={r.name}>
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  apply(r.name);
                  await togglePrayerAction(r.name as PrayerName);
                })
              }
              aria-pressed={r.prayed}
              className={`group flex w-full items-center gap-3 rounded-ctl px-2 py-1.5 text-left transition-colors hover:bg-surface-hi ${
                r.isNext ? "bg-surface-hi/60" : ""
              }`}
            >
              <span
                className={`h-[16px] w-[16px] shrink-0 rounded-full border transition-all ${
                  r.prayed
                    ? "grad-135 border-transparent"
                    : r.passed
                      ? "border-bad/50 group-hover:border-teal"
                      : "border-line group-hover:border-teal"
                }`}
              />
              <span
                className={`flex-1 text-sm ${r.prayed ? "text-muted" : "text-ink"}`}
              >
                {r.label}
                {r.isNext && (
                  <span className="ml-2 text-[0.65rem] uppercase tracking-wider text-teal">
                    next
                  </span>
                )}
              </span>
              <span
                className={`tnum shrink-0 font-mono text-xs ${
                  r.prayed ? "text-teal" : r.passed ? "text-faint" : "text-muted"
                }`}
              >
                {time(new Date(r.at))}
              </span>
            </button>
          </li>
        ))}
      </ul>

    </div>
  );
}

/* ── Quran / Memorization panel ───────────────────────────────── */

function QuranPanel({
  data,
  editing,
  onEditToggle,
}: {
  data: QuranData;
  editing: boolean;
  onEditToggle: () => void;
}) {
  const [state, apply] = useOptimistic(
    data,
    (s: QuranData, surahNumber: number): QuranData => {
      const rows = s.rows.map((r) =>
        r.surahNumber === surahNumber
          ? { ...r, status: NEXT_STATUS[r.status] }
          : r,
      );
      const memorized = rows.filter((r) => r.status === "memorized");
      return {
        ...s,
        rows,
        memorized: memorized.length,
        learning: rows.filter((r) => r.status === "learning").length,
        ayahsMemorized: memorized.reduce((n, r) => n + r.ayahCount, 0),
      };
    },
  );
  const [, startTransition] = useTransition();

  const pct =
    state.ayahsTotal === 0
      ? 0
      : (state.ayahsMemorized / state.ayahsTotal) * 100;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[0.82rem] font-semibold text-ink">
            Memorization
          </h3>
          <p className="text-[0.7rem] text-faint">
            {num(state.ayahsMemorized)} of {num(state.ayahsTotal)} ayahs
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Link
            href="/quran"
            className="flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-hi hover:text-ink"
            title="Quran library"
            aria-label="Open the Quran library"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M8 3.5C6.5 2.4 4.3 2 2 2.2v10.3c2.3-.2 4.5.2 6 1.3 1.5-1.1 3.7-1.5 6-1.3V2.2C11.7 2 9.5 2.4 8 3.5zM8 3.5v10.3" />
            </svg>
          </Link>
          <button
            type="button"
            onClick={onEditToggle}
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
              editing
                ? "bg-teal/20 text-teal"
                : "text-faint hover:text-ink hover:bg-surface-hi"
            }`}
            title={editing ? "Done editing" : "Edit surah list"}
            aria-label={editing ? "Done editing surah list" : "Edit surah list"}
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              {editing ? (
                <polyline points="3 8.5 6.5 12 13 4" />
              ) : (
                <>
                  <path d="M11.5 1.5l3 3L5 14H2v-3z" />
                  <path d="M9.5 3.5l3 3" />
                </>
              )}
            </svg>
          </button>
          <div className="shrink-0 text-right">
            <div className="tnum grad-text text-lg font-semibold leading-none">
              {state.memorized}/{state.total}
            </div>
            {state.learning > 0 && (
              <div className="tnum mt-1 text-[0.7rem] text-violet">
                {state.learning} learning
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2">
        <Bar pct={pct} />
      </div>

      {editing ? (
        <SurahPicker tracked={state.rows.map((r) => r.surahNumber)} />
      ) : (
        <>
          <ul className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 deen-scroll">
            {state.rows.map((r) => (
              <SurahLine
                key={r.surahNumber}
                row={r}
                onCycle={() =>
                  startTransition(async () => {
                    apply(r.surahNumber);
                    await cycleSurahAction(r.surahNumber);
                  })
                }
              />
            ))}
          </ul>
          <p className="mt-auto pt-2 border-t border-line-soft text-[0.6rem] text-faint">
            Tap a name to read · the dot logs memorization
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Two targets on one row: the status dot logs memorization, everything else
 * opens the surah in the reader. They used to be one button that only cycled
 * status, so a tap meant for reading would silently change hifz progress.
 */
function SurahLine({ row, onCycle }: { row: SurahRow; onCycle: () => void }) {
  const dot =
    row.status === "memorized"
      ? "grad-135 border-transparent"
      : row.status === "learning"
        ? "border-violet bg-violet/25"
        : "border-line";
  const label =
    row.status === "memorized"
      ? "memorized"
      : row.status === "learning"
        ? "memorizing"
        : "not started";

  return (
    <li className="group/row flex items-center rounded-ctl transition-colors hover:bg-surface-hi">
      <button
        type="button"
        onClick={onCycle}
        className="group grid h-8 w-8 shrink-0 place-items-center rounded-ctl"
        title={`${row.name}: ${label} — tap to change`}
        aria-label={`${row.name} is ${label}. Change memorization status`}
      >
        <span
          className={`h-[14px] w-[14px] rounded-full border transition-all group-hover:scale-110 group-hover:border-teal ${dot}`}
        />
      </button>
      <Link
        href={`/quran/${row.surahNumber}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pr-2"
        title={`Read ${row.name}`}
      >
        <span className="tnum w-6 shrink-0 font-mono text-[0.64rem] text-faint">
          {row.surahNumber}
        </span>
        <span
          className={`flex-1 truncate text-sm ${
            row.status === "memorized" ? "text-muted" : "text-ink"
          } group-hover/row:text-ink`}
        >
          {row.name}
        </span>
        <span className="tnum shrink-0 font-mono text-[0.66rem] text-faint group-hover/row:hidden">
          {row.ayahCount}
        </span>
        <span className="hidden shrink-0 text-[0.66rem] text-teal group-hover/row:inline">
          Read →
        </span>
      </Link>
    </li>
  );
}

/* ── Surah picker (edit mode) ─────────────────────────────────── */

function SurahPicker({ tracked }: { tracked: number[] }) {
  const trackedSet = new Set(tracked);
  const [filter, setFilter] = useState("");
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<Set<number>>(new Set());

  const filtered = filter
    ? ALL_SURAHS.filter(
        (s) =>
          s.name.toLowerCase().includes(filter.toLowerCase()) ||
          String(s.number).includes(filter),
      )
    : ALL_SURAHS;

  const toggle = (num: number) => {
    setPending((p) => new Set(p).add(num));
    startTransition(async () => {
      if (trackedSet.has(num)) {
        await removeSurahAction(num);
      } else {
        await addSurahAction(num);
      }
      setPending((p) => {
        const next = new Set(p);
        next.delete(num);
        return next;
      });
    });
  };

  return (
    <div className="mt-2 flex min-h-0 flex-1 flex-col">
      <input
        type="text"
        placeholder="Search surahs..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="field mb-2 !py-1.5 !text-xs"
      />
      <ul className="flex-1 overflow-y-auto pr-1 deen-scroll">
        {filtered.map((s) => {
          const isTracked = trackedSet.has(s.number);
          const isPending = pending.has(s.number);
          return (
            <li key={s.number}>
              <button
                type="button"
                onClick={() => toggle(s.number)}
                disabled={isPending}
                className={`group flex w-full items-center gap-2.5 rounded-ctl px-2 py-1 text-left transition-colors hover:bg-surface-hi ${
                  isPending ? "opacity-50" : ""
                }`}
              >
                <span
                  className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-sm border transition-all ${
                    isTracked
                      ? "grad-135 border-transparent"
                      : "border-line group-hover:border-teal"
                  }`}
                >
                  {isTracked && (
                    <svg
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="#10202c"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-2.5 w-2.5"
                    >
                      <polyline points="2.5 6 5 8.5 9.5 3.5" />
                    </svg>
                  )}
                </span>
                <span className="tnum w-6 shrink-0 font-mono text-[0.64rem] text-faint">
                  {s.number}
                </span>
                <span
                  className={`flex-1 truncate text-[0.8rem] ${
                    isTracked ? "text-ink" : "text-muted"
                  }`}
                >
                  {s.name}
                </span>
                <span className="tnum shrink-0 font-mono text-[0.62rem] text-faint">
                  {s.ayahs}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
