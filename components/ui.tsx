import type { ReactNode } from "react";
import { Tile3D } from "./Tile3D";

/** The card every widget sits in — an extruded slab on its own 3D stage. */
export function Tile({
  title,
  sub,
  right,
  children,
  className = "",
  tilt = true,
  edge,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  tilt?: boolean;
  /** Pinned to the tile's own edge, outside the body (which clips and scrolls). */
  edge?: ReactNode;
}) {
  return (
    <Tile3D tilt={tilt}>
      <div className={`tile ${className}`}>
        {edge}
        {/* Sits on the highest plane, so the tilt parallaxes it over the body. */}
        <div className="tile-head flex shrink-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="tile-title">{title}</h2>
            {/* Subtitles carry live countdowns ("Dhuhr in 3m"), which can tick over between the server render and the browser. */}
            {sub && <p className="tile-sub" suppressHydrationWarning>{sub}</p>}
          </div>
          {right && <div className="shrink-0 text-right">{right}</div>}
        </div>
        {/* Scrolls on its own so a tall tile never pushes the dashboard past
            the fold — the header above stays pinned. */}
        <div className="tile-body">{children}</div>
      </div>
    </Tile3D>
  );
}

/** Big number + caption. The unit of a scannable dashboard. */
export function Stat({
  value,
  label,
  tone = "ink",
  hint,
}: {
  value: ReactNode;
  label: string;
  tone?: "ink" | "teal" | "violet" | "muted" | "bad";
  hint?: ReactNode;
}) {
  const toneClass = {
    ink: "text-ink",
    teal: "text-teal drop-shadow-[0_0_10px_rgba(47,225,196,0.35)]",
    violet: "text-violet drop-shadow-[0_0_10px_rgba(124,92,240,0.4)]",
    muted: "text-muted",
    bad: "text-bad drop-shadow-[0_0_10px_rgba(240,96,122,0.3)]",
  }[tone];

  return (
    <div className="min-w-0">
      <div
        className={`tnum truncate text-xl font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.5)] ${toneClass}`}
      >
        {value}
      </div>
      <div className="mt-0.5 truncate text-[0.7rem] uppercase tracking-wider text-faint">
        {label}
      </div>
      {hint && <div className="tnum mt-0.5 text-[0.7rem] text-muted">{hint}</div>}
    </div>
  );
}

/** Gradient progress bar. Renders nothing at 0 rather than a stray dot. */
export function Bar({
  pct,
  tone = "grad",
}: {
  pct: number;
  tone?: "grad" | "teal" | "warn";
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill =
    tone === "grad" ? "grad" : tone === "warn" ? "bg-warn" : "bg-teal";
  return (
    <div className="track">
      {clamped > 0 && (
        <div className={`track-fill ${fill}`} style={{ width: `${clamped}%` }} />
      )}
    </div>
  );
}

/** Signed change, coloured by direction. */
export function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const flat = Math.abs(value) < 0.05;
  return (
    <span
      className={`tnum text-xs font-medium ${
        flat ? "text-muted" : value > 0 ? "text-teal" : "text-bad"
      }`}
    >
      {flat ? "" : value > 0 ? "▲ " : "▼ "}
      {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

/** Sparkline-ish bar chart for a short series. Bars are capped and lit so the
    series reads as standing columns rather than flat ticks. */
export function MiniBars({
  values,
  target,
}: {
  values: (number | null)[];
  target?: number;
}) {
  const max = Math.max(...values.map((v) => v ?? 0), target ?? 0, 1);
  return (
    <div className="flex h-9 items-end gap-[3px]">
      {values.map((v, i) => {
        const hit = target != null && v != null && v >= target;
        return (
          <div
            key={i}
            title={v == null ? "no data" : String(v)}
            className={`flex-1 rounded-sm transition-all ${
              v == null
                ? "bg-line/40"
                : hit
                  ? "bar-3d bg-gradient-to-t from-teal-dim to-teal"
                  : "bar-3d bg-gradient-to-t from-violet-dim to-violet/80"
            }`}
            style={{ height: `${v == null ? 6 : Math.max(8, (v / max) * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-xs leading-relaxed text-faint">{children}</p>;
}

export function Row({
  left,
  right,
  muted = false,
}: {
  left: ReactNode;
  right: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className={`min-w-0 truncate text-sm ${muted ? "text-muted" : ""}`}>
        {left}
      </span>
      <span className="tnum shrink-0 font-mono text-xs">{right}</span>
    </div>
  );
}
