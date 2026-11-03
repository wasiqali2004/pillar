"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { TafsirId } from "./types";

/**
 * Display preferences — translation/context toggles, text size, page theme.
 * These are per-device conveniences (a phone wants a different text size to a
 * desktop), so they live in localStorage rather than the database. Reading
 * progress, bookmarks and notes are the things that must persist, and those
 * go to the database.
 */

export type ReaderPrefs = {
  translation: boolean;
  context: boolean;
  tafsir: TafsirId;
  scale: number;
  theme: "night" | "paper";
};

const KEY = "pillar.quran.prefs";
const EVENT = "pillar:quran-prefs";

export const DEFAULT_PREFS: ReaderPrefs = {
  translation: true,
  context: false,
  tafsir: 169,
  scale: 1,
  theme: "night",
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

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function usePrefs() {
  // The snapshot is the raw string, which is stable between reads — parsing
  // inside getSnapshot would hand React a new object every time and loop.
  const raw = useSyncExternalStore(subscribe, read, () => null);

  const prefs = useMemo<ReaderPrefs>(() => {
    if (!raw) return DEFAULT_PREFS;
    try {
      return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ReaderPrefs>) };
    } catch {
      return DEFAULT_PREFS;
    }
  }, [raw]);

  const set = useCallback(
    (patch: Partial<ReaderPrefs>) => {
      const next = JSON.stringify({ ...prefs, ...patch });
      memory = next;
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        // Storage blocked (private window) — the change just won't stick.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [prefs],
  );

  return [prefs, set] as const;
}
