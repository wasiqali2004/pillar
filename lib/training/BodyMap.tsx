"use client";

import { useCallback, useRef, useState } from "react";
import { MUSCLE_LABELS, type MuscleGroup } from "./muscles";

/**
 * A holographic body map: two hand-authored anatomical views on a card that
 * turns in 3D, with the muscles trained on a given day lit up.
 *
 * Geometry notes — every path below is authored for the LEFT half of a
 * 200×460 viewBox and mirrored about x=100 by the renderer (`mirror: true`).
 * Authoring one side is what keeps the figure symmetrical: nudging a shoulder
 * can't silently desync from its twin, because there is only one of it.
 *
 * `id: "inert"` marks the parts that aren't trainable (head, hands, pelvis,
 * feet, joints). They draw in the base wireframe style and never highlight.
 */

type Region = { id: MuscleGroup | "inert"; d: string; mirror?: boolean };

const HEAD: Region[] = [
  {
    id: "inert",
    d: "M100 17 C110 17 116 26 116 37 C116 49 109 57 100 57 C91 57 84 49 84 37 C84 26 90 17 100 17 Z",
  },
  {
    id: "inert",
    d: "M92 48 C92 60 91 68 88 73 C95 77 105 77 112 73 C109 68 108 60 108 48 Z",
  },
];

const ARMS_LOWER: Region[] = [
  {
    id: "forearms",
    mirror: true,
    d: "M56 176 C48 186 43 204 41 224 C40 240 42 250 46 254 C52 248 55 230 57 210 C58 194 58 182 56 176 Z",
  },
  {
    id: "inert",
    mirror: true,
    d: "M46 246 C40 252 37 262 38 272 C40 281 46 284 51 279 C53 268 52 254 50 246 Z",
  },
];

const LEGS_LOWER: Region[] = [
  {
    id: "inert",
    mirror: true,
    d: "M67 342 C64 352 65 362 70 367 C77 369 83 364 84 355 C84 347 81 342 78 340 Z",
  },
  {
    id: "inert",
    mirror: true,
    d: "M74 416 C68 423 63 430 63 436 C70 441 84 440 88 436 L88 418 Z",
  },
];

/** Shared by both views: shoulder caps, and the delt→elbow overlap. */
const DELT: Region = {
  id: "shoulders",
  mirror: true,
  d: "M82 90 C70 92 58 99 53 112 C50 124 53 136 60 141 C69 135 77 120 83 104 Z",
};

const FRONT: Region[] = [
  ...HEAD,
  {
    id: "traps",
    mirror: true,
    d: "M90 68 C89 80 86 88 80 94 C74 99 70 101 67 103 C76 112 88 116 100 116 L100 100 C96 92 93 80 92 68 Z",
  },
  DELT,
  {
    id: "chest",
    mirror: true,
    d: "M99 98 C88 100 77 106 71 116 C66 128 68 144 76 153 C86 159 95 154 99 148 Z",
  },
  {
    id: "biceps",
    mirror: true,
    d: "M62 108 C54 116 49 134 48 155 C47 170 50 181 56 185 C62 179 65 158 66 136 C66 122 65 113 62 108 Z",
  },
  ...ARMS_LOWER,
  {
    id: "obliques",
    mirror: true,
    d: "M88 142 C79 147 72 158 70 174 C68 194 72 214 81 226 C85 227 88 224 88 220 Z",
  },
  {
    id: "abs",
    d: "M86 146 C84 172 85 200 89 222 C95 231 105 231 111 222 C115 200 116 172 114 146 C105 141 95 141 86 146 Z",
  },
  {
    id: "inert",
    d: "M70 216 C73 236 79 252 88 264 C95 270 105 270 112 264 C121 252 127 236 130 216 C110 226 90 226 70 216 Z",
  },
  {
    id: "quads",
    mirror: true,
    d: "M72 240 C64 260 61 292 63 320 C65 340 70 351 77 353 C85 347 89 320 90 290 C91 266 88 248 86 240 Z",
  },
  {
    id: "calves",
    mirror: true,
    d: "M70 356 C63 370 61 390 64 406 C66 418 72 424 79 424 C86 417 88 396 87 376 C86 366 84 358 81 356 Z",
  },
  ...LEGS_LOWER,
];

const BACK: Region[] = [
  ...HEAD,
  {
    id: "traps",
    mirror: true,
    d: "M97 62 C94 76 88 86 80 94 C74 99 70 102 67 104 C74 118 86 130 100 138 L100 68 Z",
  },
  DELT,
  {
    id: "lats",
    mirror: true,
    d: "M98 116 C87 118 76 126 70 138 C66 156 69 178 78 196 C87 202 96 199 98 192 Z",
  },
  {
    id: "triceps",
    mirror: true,
    d: "M60 108 C52 116 47 134 46 155 C45 170 48 181 54 185 C60 179 63 158 64 136 C64 122 63 113 60 108 Z",
  },
  ...ARMS_LOWER,
  {
    id: "lower_back",
    mirror: true,
    d: "M80 196 C75 206 74 220 77 232 C85 239 96 241 100 238 L100 198 C92 201 85 200 80 196 Z",
  },
  {
    id: "glutes",
    mirror: true,
    d: "M99 230 C87 230 76 237 71 250 C68 263 73 276 84 282 C94 284 99 277 100 266 Z",
  },
  {
    id: "hamstrings",
    mirror: true,
    d: "M72 274 C65 292 62 318 64 338 C66 350 71 355 78 355 C86 349 89 320 90 294 C90 284 88 277 86 274 Z",
  },
  {
    id: "calves",
    mirror: true,
    d: "M69 356 C62 372 60 392 63 407 C66 419 73 425 79 424 C87 417 89 394 88 374 C87 364 84 358 81 356 Z",
  },
  ...LEGS_LOWER,
];

/** The orbiting rings from the reference art. Purely decorative. */
const RINGS = [
  { cy: 96, rx: 78, ry: 13 },
  { cy: 168, rx: 86, ry: 15 },
  { cy: 246, rx: 80, ry: 14 },
  { cy: 330, rx: 72, ry: 12 },
  { cy: 418, rx: 64, ry: 11 },
];

/** Fixed, not random — Math.random() here would desync SSR from hydration. */
const MOTES = [
  [88, 120], [112, 132], [95, 170], [106, 196], [80, 186], [120, 176],
  [92, 250], [110, 244], [76, 300], [124, 312], [82, 390], [118, 384],
  [60, 130], [140, 134], [88, 96], [112, 92], [74, 340], [126, 344],
  [50, 220], [150, 228], [98, 210], [102, 156],
];

function Figure({
  regions,
  worked,
  selected,
  onSelect,
  idPrefix,
}: {
  regions: Region[];
  worked: Set<MuscleGroup>;
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup | null) => void;
  idPrefix: string;
}) {
  return (
    <svg
      viewBox="0 0 200 460"
      className="h-full w-full"
      role="img"
      aria-label="Body map of trained muscle groups"
    >
      <defs>
        <linearGradient id={`${idPrefix}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3aa7ff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2fe1c4" stopOpacity="0.10" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-hot`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5df3ff" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#2fe1c4" stopOpacity="0.38" />
        </linearGradient>
        <filter id={`${idPrefix}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`${idPrefix}-softglow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* energy rings, behind the figure */}
      <g className="body-rings" filter={`url(#${idPrefix}-softglow)`}>
        {RINGS.map((r, i) => (
          <ellipse
            key={i}
            cx="100"
            cy={r.cy}
            rx={r.rx}
            ry={r.ry}
            fill="none"
            stroke="#4bc8ff"
            strokeWidth="0.9"
            opacity="0.32"
          />
        ))}
      </g>

      {/* the body itself */}
      <g filter={`url(#${idPrefix}-softglow)`}>
        {regions.map((r, i) => {
          const isMuscle = r.id !== "inert";
          const active = isMuscle && worked.has(r.id as MuscleGroup);
          const isSelected = isMuscle && selected === r.id;
          const dim = isMuscle && selected != null && !isSelected;

          const cls = [
            "body-region",
            active && "body-region-active",
            isSelected && "body-region-selected",
            dim && "body-region-dim",
            isMuscle && "body-region-hit",
          ]
            .filter(Boolean)
            .join(" ");

          const copies = r.mirror ? [false, true] : [false];
          return copies.map((flip) => (
            <path
              key={`${i}-${flip}`}
              d={r.d}
              className={cls}
              fill={
                active ? `url(#${idPrefix}-hot)` : `url(#${idPrefix}-body)`
              }
              filter={active ? `url(#${idPrefix}-glow)` : undefined}
              transform={flip ? "translate(200,0) scale(-1,1)" : undefined}
              onClick={
                isMuscle
                  ? (e) => {
                      e.stopPropagation();
                      onSelect(isSelected ? null : (r.id as MuscleGroup));
                    }
                  : undefined
              }
            >
              {isMuscle && <title>{MUSCLE_LABELS[r.id as MuscleGroup]}</title>}
            </path>
          ));
        })}
      </g>

      {/* motes, for the hologram texture in the reference art */}
      <g className="body-motes">
        {MOTES.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 1.4 : 0.9} fill="#8fe9ff" />
        ))}
      </g>
    </svg>
  );
}

export function BodyMap({
  worked,
  selected,
  onSelect,
}: {
  worked: MuscleGroup[];
  selected: MuscleGroup | null;
  onSelect: (m: MuscleGroup | null) => void;
}) {
  const [angle, setAngle] = useState(0);
  const drag = useRef<{ x: number; from: number; moved: boolean } | null>(null);
  const workedSet = new Set(worked);

  // 90..270 is the half-turn where you're looking at the far face.
  const norm = ((angle % 360) + 360) % 360;
  const showingBack = norm > 90 && norm < 270;

  const turnTo = useCallback((face: "front" | "back") => {
    setAngle((a) => {
      // Rotate to the nearest equivalent angle rather than snapping to 0/180,
      // so the figure never spins the long way round after several turns.
      const target = face === "front" ? 0 : 180;
      return Math.round((a - target) / 360) * 360 + target;
    });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { x: e.clientX, from: angle, moved: false };
    },
    [angle],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    setAngle(d.from + dx * 0.8);
  }, []);

  const onPointerUp = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    // Settle on whichever face is closest — a body stopped at 43° is just a
    // rendering artifact, not a view anyone wants to read from.
    setAngle((a) => Math.round(a / 180) * 180);
  }, []);

  return (
    <div className="flex min-h-0 flex-col items-center gap-3">
      <div
        className="body-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="body-turntable"
          style={{ transform: `rotateY(${angle}deg)` }}
        >
          <div className="body-face">
            <Figure
              regions={FRONT}
              worked={workedSet}
              selected={selected}
              onSelect={onSelect}
              idPrefix="f"
            />
          </div>
          <div className="body-face body-face-back">
            <Figure
              regions={BACK}
              worked={workedSet}
              selected={selected}
              onSelect={onSelect}
              idPrefix="b"
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className={`pill ${!showingBack ? "pill-selected" : ""}`}
          onClick={() => turnTo("front")}
        >
          Front
        </button>
        <button
          type="button"
          className="pill"
          onClick={() => setAngle((a) => a + 180)}
          aria-label="Turn the body around"
          title="Turn — or just drag the figure"
        >
          ⟲ Turn
        </button>
        <button
          type="button"
          className={`pill ${showingBack ? "pill-selected" : ""}`}
          onClick={() => turnTo("back")}
        >
          Back
        </button>
      </div>
      <p className="shrink-0 text-[0.65rem] text-faint">
        Drag the figure to rotate · tap a muscle to isolate it
      </p>
    </div>
  );
}
