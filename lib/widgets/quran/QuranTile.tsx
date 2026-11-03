"use client";

import { useOptimistic, useTransition } from "react";
import type { QuranData, SurahRow } from ".";
import { cycleSurahAction } from "../actions";
import { Tile, Bar } from "@/components/ui";
import { num } from "@/lib/format";

const NEXT = {
  not_started: "learning",
  learning: "memorized",
  memorized: "not_started",
} as const;

export function QuranTile({ data }: { data: QuranData }) {
  const [state, apply] = useOptimistic(
    data,
    (s: QuranData, surahNumber: number): QuranData => {
      const rows = s.rows.map((r) =>
        r.surahNumber === surahNumber ? { ...r, status: NEXT[r.status] } : r,
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
    <Tile
      title="Memorization"
      sub={`${num(state.ayahsMemorized)} of ${num(state.ayahsTotal)} ayahs`}
      right={
        <>
          <div className="tnum grad-text text-lg font-semibold leading-none">
            {state.memorized}/{state.total}
          </div>
          {state.learning > 0 && (
            <div className="tnum mt-1 text-[0.7rem] text-violet">
              {state.learning} learning
            </div>
          )}
        </>
      }
    >
      <div className="mt-4">
        <Bar pct={pct} />
      </div>

      <ul className="mt-3 -mx-1 flex flex-col pr-1">
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

      <p className="mt-2 border-t border-line-soft pt-2.5 text-[0.62rem] text-faint">
        Tap to cycle: not started → learning → memorized
      </p>
    </Tile>
  );
}

function SurahLine({ row, onCycle }: { row: SurahRow; onCycle: () => void }) {
  const dot =
    row.status === "memorized"
      ? "grad-135 border-transparent"
      : row.status === "learning"
        ? "border-violet bg-violet/25"
        : "border-line";

  return (
    <li>
      <button
        type="button"
        onClick={onCycle}
        className="group flex w-full items-center gap-2.5 rounded-ctl px-2 py-1.5 text-left transition-colors hover:bg-surface-hi"
      >
        <span
          className={`h-[15px] w-[15px] shrink-0 rounded-full border transition-all group-hover:border-teal ${dot}`}
        />
        <span className="tnum w-6 shrink-0 font-mono text-[0.66rem] text-faint">
          {row.surahNumber}
        </span>
        <span
          className={`flex-1 truncate text-sm ${
            row.status === "memorized" ? "text-muted" : "text-ink"
          }`}
        >
          {row.name}
        </span>
        <span className="tnum shrink-0 font-mono text-[0.68rem] text-faint">
          {row.ayahCount}
        </span>
      </button>
    </li>
  );
}
