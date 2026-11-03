"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { CATEGORIES, type Category } from "./quotes";

/**
 * Which category the tile draws from, and whether it advances on its own.
 * A per-device preference like the Quran reader's, so it lives in
 * localStorage: nothing here is worth a database round-trip, and keeping it
 * client-side is what makes the toggles instant.
 *
 * `getServerSnapshot` returns the defaults so SSR and the first client render
 * agree — React then re-renders with the stored value once mounted, which is
 * the supported way to avoid a hydration mismatch here.
 */

export type MeditationPrefs = {
  /** False freezes the current quote until it's turned back on. */
  rotate: boolean;
  category: Category | "all";
};

const KEY = "pillar.meditation.prefs";
const EVENT = "pillar:meditation-prefs";

export const DEFAULT_PREFS: MeditationPrefs = {
  rotate: true,
  category: "all",
};

/** Fallback when storage is blocked, so toggles still work for the visit. */
let memory: string | null = null;

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function write(raw: string) {
  memory = raw;
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // Private mode or blocked site data — the in-memory copy still serves.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  // `storage` fires for other tabs, so a change on one stays in step.
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

const SERVER_SNAPSHOT = JSON.stringify(DEFAULT_PREFS);

function getSnapshot(): string {
  return read() ?? SERVER_SNAPSHOT;
}

function getServerSnapshot(): string {
  return SERVER_SNAPSHOT;
}

function parse(raw: string): MeditationPrefs {
  try {
    const v = JSON.parse(raw) as Partial<MeditationPrefs>;
    const category =
      v.category === "all" || CATEGORIES.includes(v.category as Category)
        ? (v.category as Category | "all")
        : DEFAULT_PREFS.category;
    return {
      rotate: typeof v.rotate === "boolean" ? v.rotate : DEFAULT_PREFS.rotate,
      category,
    };
  } catch {
    // A hand-edited or half-written value must not break the tile.
    return DEFAULT_PREFS;
  }
}

export function useMeditationPrefs() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const prefs = useMemo(() => parse(raw), [raw]);

  const set = useCallback(
    (patch: Partial<MeditationPrefs>) => {
      write(JSON.stringify({ ...parse(getSnapshot()), ...patch }));
    },
    [],
  );

  return [prefs, set] as const;
}
