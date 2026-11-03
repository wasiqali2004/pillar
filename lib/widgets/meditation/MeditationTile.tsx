"use client";

import { useEffect, useRef, useState } from "react";
import type { MeditationData } from ".";
import { Tile } from "@/components/ui";
import { useMeditationPrefs } from "./prefs";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  poolFor,
  quoteFor,
  slotFor,
} from "./quotes";

export function MeditationTile({ data }: { data: MeditationData }) {
  const [prefs, setPrefs] = useMeditationPrefs();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  /**
   * The slot drives which quote shows. It starts at the server's value so the
   * first client render matches the HTML, then advances on its own — without
   * this the tile would sit on one quote until something else re-rendered the
   * page, which for a tab left open all day is most of the day.
   */
  const [slot, setSlot] = useState(data.slot);

  /**
   * Pausing freezes whatever is on screen rather than snapping back to the
   * server's pick, so turning rotation off keeps the line you were reading.
   */
  const [frozen, setFrozen] = useState<number | null>(null);

  useEffect(() => {
    // Checked every half-minute rather than scheduled for the boundary: a
    // laptop that sleeps through the changeover fires nothing, and this
    // catches up on the first tick after it wakes.
    const tick = () => setSlot(slotFor(Date.now()));
    tick();
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // Dismiss the settings panel on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = prefs.rotate ? slot : (frozen ?? slot);
  const quote = quoteFor(prefs.category, active);
  const poolSize = poolFor(prefs.category).length;

  function toggleRotate() {
    if (prefs.rotate) setFrozen(slot);
    else setFrozen(null);
    setPrefs({ rotate: !prefs.rotate });
  }

  /** Manual advance — useful while paused, and to skip a line you've read. */
  function next() {
    if (prefs.rotate) setPrefs({ rotate: false });
    setFrozen((f) => (f ?? slot) + 1);
  }

  const label =
    prefs.category === "all" ? "All" : CATEGORY_LABELS[prefs.category];

  return (
    <Tile
      title="Reflection"
      right={
        <div ref={panel} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="pill"
            aria-expanded={open}
            aria-label="Reflection settings"
            title="Choose a category, or pause rotation"
          >
            {label}
            <span className="opacity-60">{prefs.rotate ? "⟳" : "❚❚"}</span>
          </button>

          {open && (
            <div className="meditation-pop">
              <button
                type="button"
                onClick={toggleRotate}
                className={`pill w-full justify-center ${
                  prefs.rotate ? "pill-selected" : ""
                }`}
              >
                {prefs.rotate ? "Rotating every 2h" : "Paused"}
              </button>

              <p className="mt-2.5 mb-1 text-[0.62rem] uppercase tracking-wider text-faint">
                Category
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrefs({ category: "all" })}
                  className={`pill ${prefs.category === "all" ? "pill-highlight" : ""}`}
                >
                  All
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPrefs({ category: c })}
                    className={`pill ${prefs.category === c ? "pill-highlight" : ""}`}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>

              <p className="mt-2.5 border-t border-line-soft pt-2 font-mono text-[0.6rem] text-faint">
                {poolSize} reflections in rotation
              </p>
            </div>
          )}
        </div>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-2xl font-light italic leading-relaxed text-ink">
          &ldquo;{quote.text}&rdquo;
        </p>
        {quote.by && (
          <p className="text-[0.7rem] uppercase tracking-wider text-faint">
            — {quote.by}
          </p>
        )}
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-line-soft pt-2.5">
        <span className="text-[0.62rem] uppercase tracking-wider text-faint">
          {CATEGORY_LABELS[quote.category]}
        </span>
        <button
          type="button"
          onClick={next}
          className="text-[0.65rem] text-faint transition-colors hover:text-teal"
          title={
            prefs.rotate
              ? "Show another — this also pauses rotation"
              : "Show another"
          }
        >
          Next →
        </button>
      </div>
    </Tile>
  );
}
