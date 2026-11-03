"use client";

import { useOptimistic, useTransition } from "react";
import type { PrayersData } from ".";
import { togglePrayerAction } from "../actions";
import { Tile, Bar } from "@/components/ui";
import { time, relative } from "@/lib/format";
import { TreeTab } from "@/components/tree/TreeTab";
import { PrayerSetupPrompt } from "./SetupPrompt";

export function PrayersTile({ data }: { data: PrayersData }) {
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
      <Tile title="Prayers">
        <PrayerSetupPrompt />
      </Tile>
    );
  }

  return (
    <Tile
      title="Prayers"
      sub={
        next
          ? `${next.label} ${relative(new Date(next.at))}`
          : "All prayers passed"
      }
      right={
        <>
          <div className="tnum grad-text text-lg font-semibold leading-none">
            {state.doneCount}/5
          </div>
          {state.streak > 0 && (
            <div className="tnum mt-1 text-[0.7rem] text-teal">
              {state.streak}d full
            </div>
          )}
        </>
      }
      edge={<TreeTab full={state.doneCount === 5} />}
    >
      <div className="mt-3">
        <Bar pct={(state.doneCount / 5) * 100} />
      </div>

      <ul className="mt-3 flex flex-col">
        {state.rows.map((r) => (
          <li key={r.name}>
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  apply(r.name);
                  await togglePrayerAction(r.name);
                })
              }
              aria-pressed={r.prayed}
              className={`group flex w-full items-center gap-3 rounded-ctl px-2 py-1.5 text-left transition-colors hover:bg-surface-hi ${
                r.isNext ? "bg-surface-hi/60" : ""
              }`}
            >
              <span
                className={`h-[18px] w-[18px] shrink-0 rounded-full border transition-all ${
                  r.prayed
                    ? "grad-135 border-transparent"
                    : r.passed
                      ? "border-bad/50 group-hover:border-teal"
                      : "border-line group-hover:border-teal"
                }`}
              />
              <span
                className={`flex-1 text-sm ${
                  r.prayed ? "text-muted" : r.isNext ? "text-ink" : "text-ink"
                }`}
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

      <p className="mt-2 border-t border-line-soft pt-2 font-mono text-[0.62rem] text-faint">
        {state.place} · {state.method} · {state.madhab}
      </p>
    </Tile>
  );
}
