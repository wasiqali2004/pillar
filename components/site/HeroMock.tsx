"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { WidgetGlyph } from "@/components/onboarding/WidgetGlyph";
import type { WidgetId } from "@/lib/dashboard/catalog";

/**
 * The website hero: a small, illustrative version of the dashboard in the
 * classic layout that tilts toward the pointer. Every number in it is sample
 * data for the picture, not anyone's real data.
 */
const TILES: { id: WidgetId; title: string; span: string; body?: ReactNode }[] = [
  {
    id: "deen",
    title: "Deen",
    span: "col-span-6",
    body: (
      <ul className="mt-2 space-y-1.5 text-[0.62rem]">
        {[
          ["Fajr", "6:12", true],
          ["Dhuhr", "1:04", true],
          ["Asr", "4:04", true],
          ["Maghrib", "6:36", false],
          ["Isha", "7:54", false],
        ].map(([n, t, done]) => (
          <li key={n as string} className="flex items-center gap-2">
            <span className={`hm-dot ${done ? "is-on" : ""}`} />
            <span className="flex-1">{n}</span>
            <span className="font-mono text-faint">{t}</span>
          </li>
        ))}
      </ul>
    ),
  },
  { id: "body", title: "Body", span: "col-span-3" },
  {
    id: "meditation",
    title: "Reflection",
    span: "col-span-3",
    body: <p className="mt-2 text-[0.6rem] italic leading-snug text-muted">&ldquo;Small and steady beats big and rare.&rdquo;</p>,
  },
  { id: "habits", title: "Habits", span: "col-span-3" },
  { id: "goals", title: "Goals", span: "col-span-3" },
  {
    id: "money",
    title: "Money",
    span: "col-span-3",
    body: <p className="mt-2 font-mono text-[0.7rem] text-teal">$412 left</p>,
  },
  { id: "training", title: "Training", span: "col-span-3" },
  { id: "portfolio", title: "Portfolio", span: "col-span-12" },
];

export function HeroMock() {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  function onMove(e: PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--ry", `${x * 10}deg`);
      el.style.setProperty("--rx", `${-y * 8}deg`);
    });
  }

  function onLeave() {
    ref.current?.style.setProperty("--ry", "-8deg");
    ref.current?.style.setProperty("--rx", "6deg");
  }

  return (
    <div className="hm-stage" onPointerMove={onMove} onPointerLeave={onLeave}>
      <div ref={ref} className="hm-frame" aria-hidden>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">
            <span className="grad-text">Pillar</span>
          </span>
          <span className="flex gap-1.5">
            <span className="hm-pill" />
            <span className="hm-pill" />
            <span className="hm-pill hm-pill-on" />
          </span>
        </div>
        <div className="grid grid-cols-12 gap-2">
          {TILES.map((t, i) => (
            <div key={t.id} className={`hm-tile ${t.span}`} style={{ animationDelay: `${i * 0.35}s` }}>
              <div className="text-[0.62rem] font-semibold">{t.title}</div>
              {t.body ?? <WidgetGlyph id={t.id} className="mt-1 h-10 w-full" />}
            </div>
          ))}
        </div>

        <div className="hm-rafiq">
          <span className="hm-rafiq-avatar">ر</span>
          <span>
            <b className="block text-[0.62rem]">Rafiq</b>
            <span className="text-[0.62rem] text-muted">Three for three today, and leg day done. Maghrib at 6:36.</span>
          </span>
        </div>
      </div>
    </div>
  );
}
