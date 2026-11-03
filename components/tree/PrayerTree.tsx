"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { addDays, daysBetween, growTree, type Leaf, type Prayer, type TreeModel } from "@/lib/tree/model";
import { PlanButton } from "@/components/PlanModal";
import type { PlanId } from "@/lib/dashboard/catalog";

const PRAYER_LABEL: Record<Prayer, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fmtLong = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtMonth = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
const fmtShort = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const PRAYER_COLOR: Record<Prayer, string> = {
  fajr: "#9cf7d8",
  dhuhr: "#86efac",
  asr: "#c7f27a",
  maghrib: "#6ee7b7",
  isha: "#5eead4",
};

type Tip = { x: number; y: number; ax: number; ay: number; color: string; title: string; line: string; sub: string };
type View = { s: number; x: number; y: number };
const MAX_ZOOM = 12;

/** The intro grows the whole tree in this long, however old it is. */
const INTRO_MS = 2600;

export function PrayerTree({
  start,
  today,
  prayed,
  plan,
  locked,
}: {
  start: string;
  today: string;
  prayed: Record<string, Prayer[]>;
  plan: PlanId;
  locked: boolean;
}) {
  const span = daysBetween(start, today);
  const [endIdx, setEndIdx] = useState(span);
  const [potential, setPotential] = useState(false);
  const [playing, setPlaying] = useState(false);
  // "intro" staggers every piece by its day; "live" lets new pieces pop in as they appear.
  const [mode, setMode] = useState<"intro" | "live">("intro");
  const [tip, setTip] = useState<Tip | null>(null);
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Active pointers, for drag-to-pan and two-finger pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);

  const projectTo = potential ? addDays(today, 365) : undefined;
  const end = addDays(start, endIdx);

  const model = useMemo(
    () => growTree({ start, end, today, prayed, projectTo: endIdx === span ? projectTo : undefined }),
    [start, end, today, prayed, projectTo, endIdx, span],
  );
  // The camera frames the finished tree, so playback grows into the view instead of zooming around.
  const frame = useMemo(() => growTree({ start, end: today, today, prayed, projectTo }), [start, today, prayed, projectTo]);

  useEffect(() => {
    if (mode !== "intro") return;
    const t = window.setTimeout(() => setMode("live"), INTRO_MS + 1200);
    return () => window.clearTimeout(t);
  }, [mode]);

  // Watch it grow: walk the end date from the first day to today.
  useEffect(() => {
    if (!playing) return;
    const steps = Math.max(1, span);
    const per = Math.max(1, Math.ceil(steps / 160));
    const id = window.setInterval(() => {
      setEndIdx((i) => {
        const next = Math.min(span, i + per);
        if (next >= span) setPlaying(false);
        return next;
      });
    }, 34);
    return () => window.clearInterval(id);
  }, [playing, span]);

  /* ── zoom and pan, in the SVG's own units so leaves stay sharp ── */

  function toSvg(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const r = p.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  }

  function zoomAt(p: { x: number; y: number }, factor: number) {
    setView((v) => {
      const s = Math.min(MAX_ZOOM, Math.max(1, v.s * factor));
      if (s === 1) return { s: 1, x: 0, y: 0 };
      const k = s / v.s;
      return { s, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k };
    });
  }

  // From the full view, the buttons zoom towards the canopy (the middle of the
  // screen is mostly sky); once zoomed, around whatever is in the middle.
  function zoomCentre(factor: number) {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const fb = frame.bounds;
    if (view.s === 1) zoomAt({ x: (fb.minX + fb.maxX) / 2, y: fb.minY * 0.5 }, factor);
    else zoomAt(toSvg(r.left + r.width / 2, r.top + r.height / 2), factor);
  }

  // Wheel zoom needs a non-passive listener to stop the page scrolling instead.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || locked) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = svg.createSVGPoint();
      p.x = e.clientX;
      p.y = e.clientY;
      const at = p.matrixTransform(m.inverse());
      zoomAt({ x: at.x, y: at.y }, Math.exp(-e.deltaY * 0.0022));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [locked]);

  function showTip(target: Element | null, clientX: number, clientY: number) {
    const el = target?.closest<SVGElement>("[data-k]");
    const box = wrap.current?.getBoundingClientRect();
    if (!el || !box) return setTip(null);
    const d = el.dataset;
    const x = Math.min(Math.max(clientX - box.left, 120), box.width - 120);
    const base = { x, y: clientY - box.top, ax: Number(d.x), ay: Number(d.y) };
    if (d.k === "leaf" || d.k === "bud") {
      const prayer = d.p as Prayer;
      setTip({
        ...base,
        color: d.k === "leaf" ? PRAYER_COLOR[prayer] : "#8fb8a6",
        title: PRAYER_LABEL[prayer],
        line: fmtLong(d.d!),
        sub:
          d.k === "leaf"
            ? `${d.d === today ? "Today · " : ""}Day ${Number(d.i) + 1} of your tree`
            : "Not logged · this bud is waiting for you",
      });
    } else if (d.k === "bloom") {
      setTip({ ...base, color: "#f9a8d4", title: "Blossom · a full week", line: `${fmtShort(d.d!)} – ${fmtShort(d.to!)}`, sub: "All 35 prayers, seven days in a row" });
    } else if (d.k === "fruit") {
      setTip({ ...base, color: "#ff8a8a", title: "Fruit · a full month", line: fmtMonth(d.d!), sub: "Every prayer, every day of the month" });
    }
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (locked) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged.current = false;
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === "mouse") showTip(e.target as Element, e.clientX, e.clientY);
      return;
    }
    const all = [...pointers.current.entries()];
    if (all.length === 2) {
      // Pinch: zoom by how far the fingers moved apart, around their midpoint.
      const other = all.find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0) zoomAt(toSvg((e.clientX + other.x) / 2, (e.clientY + other.y) / 2), after / before);
      dragged.current = true;
    } else {
      const a = toSvg(prev.x, prev.y);
      const b = toSvg(e.clientX, e.clientY);
      if (Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y) > 2) dragged.current = true;
      if (view.s > 1) setView((v) => ({ ...v, x: v.x + b.x - a.x, y: v.y + b.y - a.y }));
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    // A tap (no drag) on a leaf shows its card: that's how it works on a phone.
    if (!dragged.current) showTip(e.target as Element, e.clientX, e.clientY);
  }

  function play() {
    setView({ s: 1, x: 0, y: 0 });
    setMode("live");
    setPotential(false);
    setEndIdx(0);
    setPlaying(true);
  }

  const b = frame.bounds;
  const w = Math.max(b.maxX - b.minX, 460);
  const h = Math.max(b.maxY - b.minY, 400);
  const cx = (b.minX + b.maxX) / 2;
  const viewBox = `${(cx - w / 2).toFixed(0)} ${(b.maxY - h).toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`;
  const canopy = { x: Math.round(cx), y: Math.round(b.minY * 0.58), rx: Math.round(w * 0.42), ry: Math.round(h * 0.36) };

  const delay = (day: number, extra = 0): CSSProperties =>
    ({ "--d": mode === "intro" ? `${((day / Math.max(1, model.totalDays)) * INTRO_MS + extra).toFixed(0)}ms` : "0ms" }) as CSSProperties;

  // Stats count real days only, so the potential view never inflates them.
  const s = model.stats;
  const empty = s.prayers === 0 && !potential;
  const fireflies = Math.min(30, 6 + s.streak * 2 + s.fullWeeks * 2);

  return (
    <main className="tree-scene">
      <Sky />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl flex-wrap items-start justify-between gap-4 px-5 pt-6 sm:px-8">
        <div>
          <Link href="/app" className="pill">
            ← Dashboard
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Your <span className="tree-grad">Prayer Tree</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {empty
              ? "Log your first prayer and it takes root."
              : `Growing since ${fmtShort(start)} · every prayer is a leaf.`}
          </p>
        </div>
        <button
          type="button"
          className={`tree-toggle ${potential ? "is-on" : ""}`}
          aria-pressed={potential}
          onClick={() => {
            setPlaying(false);
            setEndIdx(span);
            setView({ s: 1, x: 0, y: 0 });
            setMode("intro");
            setPotential((p) => !p);
          }}
        >
          <span className="tree-toggle-dot" aria-hidden />
          {potential ? "Back to today" : "See your potential"}
        </button>
      </header>

      <section className="relative z-10 mx-auto mt-5 grid w-full max-w-6xl grid-cols-2 gap-3 px-5 sm:grid-cols-5 sm:px-8">
        <Stat label="Leaves" sub="prayers prayed" value={s.prayers} tone="leaf" />
        <Stat label="Full days" sub="all five" value={s.fullDays} tone="leaf" />
        <Stat label="Blossoms" sub="full weeks" value={s.fullWeeks} tone="bloom" />
        <Stat label="Fruit" sub="full months" value={s.fullMonths} tone="fruit" />
        <Stat label="Streak" sub={`best ${s.bestStreak}`} value={s.streak} tone="glow" suffix="d" />
      </section>

      <div ref={wrap} className={`tree-stage ${locked ? "is-locked" : ""}`} onMouseLeave={() => setTip(null)}>
        <svg
          ref={svgRef}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMax meet"
          className={`tree-svg mode-${mode} ${view.s > 1 ? "is-zoomed" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
          role="img"
          aria-label={`A tree with ${s.prayers} leaves, ${s.fullWeeks} blossoms and ${s.fullMonths} fruit`}
        >
          <Defs />

          <g transform={`translate(${view.x.toFixed(2)} ${view.y.toFixed(2)}) scale(${view.s.toFixed(4)})`}>
          {/* the light the canopy sits in; brighter with a streak */}
          <ellipse
            cx={canopy.x}
            cy={canopy.y}
            rx={canopy.rx}
            ry={canopy.ry}
            fill="url(#tr-halo)"
            style={{ opacity: Math.min(1, 0.35 + s.streak * 0.04 + (potential ? 0.3 : 0)) }}
          />

          <Ground cx={Math.round(cx)} w={Math.round(w)} />

          <Branches model={model} delay={delay} />
          <Leaves leaves={model.leaves} delay={delay} />
          <Blooms model={model} delay={delay} />

          {!empty && <Fireflies n={fireflies} canopy={canopy} />}

          {/* a ring of light around whatever the card is describing */}
          {tip && Number.isFinite(tip.ax) && (
            <circle cx={tip.ax} cy={tip.ay} r={7 / Math.sqrt(view.s)} className="tr-focus" style={{ stroke: tip.color, color: tip.color }} />
          )}
          </g>
        </svg>

        {tip && (
          <div className="tree-tip" style={{ left: tip.x, top: tip.y }}>
            <div className="flex items-center gap-2">
              <span className="tree-tip-dot" style={{ background: tip.color, boxShadow: `0 0 10px ${tip.color}` }} />
              <span className="font-semibold">{tip.title}</span>
            </div>
            <div className="mt-1 text-[0.8rem] text-ink">{tip.line}</div>
            <div className="mt-0.5 text-[0.7rem] text-faint">{tip.sub}</div>
          </div>
        )}

        {!locked && !empty && (
          <>
            <div className="tree-zoom" role="group" aria-label="Zoom">
              <button type="button" onClick={() => zoomCentre(1.6)} aria-label="Zoom in">
                +
              </button>
              <button type="button" onClick={() => zoomCentre(1 / 1.6)} aria-label="Zoom out" disabled={view.s <= 1}>
                &minus;
              </button>
              <button type="button" onClick={() => setView({ s: 1, x: 0, y: 0 })} aria-label="Reset view" disabled={view.s <= 1}>
                &#10226;
              </button>
            </div>
            <p className="tree-hint">
              {view.s > 1 ? `${view.s.toFixed(1)}× · drag to look around` : "Scroll or pinch to zoom in · hover a leaf to see its prayer"}
            </p>
          </>
        )}

        {potential && (
          <p className="tree-potential-note">
            Pray every prayer for a year and your tree holds{" "}
            <b>{frame.leaves.filter((l) => l.lit).length.toLocaleString("en-CA")}</b> leaves, <b>{frame.blossoms.length}</b> blossoms
            and <b>{frame.fruit.length}</b> fruit. The faint part is what hasn&apos;t grown yet.
          </p>
        )}

        {locked && (
          <div className="tree-lock">
            <div className="tree-lock-card">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal">✦ Pro</p>
              <h2 className="mt-2 text-2xl font-semibold">Your tree is already growing</h2>
              <p className="mt-2 text-sm text-muted">
                {s.prayers > 0
                  ? `${s.prayers} leaves so far. Go Pro to watch every prayer, full day and full week grow into something you can see.`
                  : "Every prayer you log becomes a leaf. Go Pro to watch it grow."}
              </p>
              <div className="mt-5 flex justify-center">
                <PlanButton plan={plan} label="Grow my tree with Pro" className="ob-next" />
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-6 sm:px-8">
        {span > 0 && !locked && (
          <div className="tree-timeline">
            <button type="button" className="tree-play" onClick={() => (playing ? setPlaying(false) : play())} aria-label={playing ? "Pause" : "Watch it grow"}>
              {playing ? "❚❚" : "▶"}
            </button>
            <input
              type="range"
              min={0}
              max={span}
              value={endIdx}
              onChange={(e) => {
                setPlaying(false);
                setPotential(false);
                setMode("live");
                setEndIdx(Number(e.target.value));
              }}
              aria-label="Scrub through your tree's history"
              className="tree-range"
              style={{ "--p": `${(endIdx / span) * 100}%` } as CSSProperties}
            />
            <span className="tnum w-36 shrink-0 text-right font-mono text-xs text-muted">
              {endIdx === span ? "Today" : fmtDay(end)}
            </span>
          </div>
        )}
        <ul className="tree-legend">
          <li>
            <i className="lg-leaf" /> a prayer
          </li>
          <li>
            <i className="lg-twig" /> a day
          </li>
          <li>
            <i className="lg-bloom" /> a full week
          </li>
          <li>
            <i className="lg-fruit" /> a full month
          </li>
          <li>
            <i className="lg-bud" /> waiting for you
          </li>
        </ul>
      </footer>
    </main>
  );
}

/* ── pieces ────────────────────────────────────────────────────── */

function Stat({ label, sub, value, tone, suffix = "" }: { label: string; sub: string; value: number; tone: string; suffix?: string }) {
  return (
    <div className={`tree-stat tone-${tone}`}>
      <div className="tnum text-2xl font-semibold leading-none">
        {value.toLocaleString("en-CA")}
        {suffix}
      </div>
      <div className="mt-1.5 text-xs font-semibold">{label}</div>
      <div className="text-[0.68rem] text-faint">{sub}</div>
    </div>
  );
}

const BARK: Record<string, [string, string]> = {
  trunk: ["#3a2a20", "#7d5a41"],
  root: ["#2f221b", "#5e4332"],
  limb: ["#3d2c22", "#86624a"],
  branch: ["#45332a", "#957058"],
  twig: ["#4b3a2e", "#a78367"],
};

function Branches({ model, delay }: { model: TreeModel; delay: (d: number, x?: number) => CSSProperties }) {
  return (
    <g className="tr-bark" strokeLinecap="round" fill="none">
      {model.segments.map((sg) => (
        <g key={sg.id} className={`tr-seg ${sg.future ? "is-future" : ""}`} style={delay(sg.day)}>
          {sg.shape ? (
            <>
              <path d={sg.shape} fill={BARK[sg.kind][0]} stroke={BARK[sg.kind][0]} strokeWidth={0.6} className="tr-wood" />
              <path d={sg.d} pathLength={1} stroke={BARK[sg.kind][1]} strokeWidth={Math.max(0.6, sg.width * 0.22)} className="tr-sheen" />
            </>
          ) : (
            <path d={sg.d} pathLength={1} stroke={BARK[sg.kind][1]} strokeWidth={sg.width} />
          )}
        </g>
      ))}
    </g>
  );
}

function Leaves({ leaves, delay }: { leaves: Leaf[]; delay: (d: number, x?: number) => CSSProperties }) {
  const real = leaves.filter((l) => !l.future);
  const future = leaves.filter((l) => l.future);
  const draw = (l: Leaf, i: number) =>
    l.lit ? (
      <g key={l.id} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.angle.toFixed(0)}) scale(${l.size.toFixed(2)})`}>
        <use
          href="#tr-leaf"
          fill={`url(#tr-leaf-${l.prayer})`}
          className={`tr-leaf ${l.today ? "is-today" : ""}`}
          style={delay(l.day, 380 + (i % 5) * 40)}
          {...(l.future
            ? {}
            : { "data-k": "leaf", "data-p": l.prayer, "data-d": l.date, "data-i": l.day, "data-x": l.x.toFixed(1), "data-y": l.y.toFixed(1) })}
        />
      </g>
    ) : (
      <circle
        key={l.id}
        cx={Math.round(l.x * 10) / 10}
        cy={Math.round(l.y * 10) / 10}
        r={l.size}
        className="tr-bud"
        style={delay(l.day, 300)}
        data-k="bud"
        data-p={l.prayer}
        data-d={l.date}
        data-x={l.x.toFixed(1)}
        data-y={l.y.toFixed(1)}
      />
    );
  return (
    <>
      <g filter="url(#tr-glow)">{real.map(draw)}</g>
      <g className="tr-future">{future.map(draw)}</g>
    </>
  );
}

function Blooms({ model, delay }: { model: TreeModel; delay: (d: number, x?: number) => CSSProperties }) {
  return (
    <>
      {model.blossoms.map((b) => (
        <g key={b.id} transform={`translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`} className={b.future ? "tr-future" : ""}>
          <g
            className="tr-bloom"
            style={delay(b.day, 700)}
            {...(b.future ? {} : { "data-k": "bloom", "data-d": b.from, "data-to": b.to, "data-x": b.x.toFixed(1), "data-y": b.y.toFixed(1) })}
          >
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse key={a} cx={0} cy={-b.size * 0.55} rx={b.size * 0.42} ry={b.size * 0.62} transform={`rotate(${a})`} fill="url(#tr-petal)" />
            ))}
            <circle r={b.size * 0.28} fill="#ffd77a" />
          </g>
        </g>
      ))}
      {model.fruit.map((f) => (
        <g key={f.id} transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})`} className={f.future ? "tr-future" : ""}>
          <g
            className="tr-fruit"
            style={delay(f.day, 900)}
            {...(f.future ? {} : { "data-k": "fruit", "data-d": f.from, "data-to": f.to, "data-x": f.x.toFixed(1), "data-y": f.y.toFixed(1) })}
          >
            <line x1={0} y1={-f.size - 12} x2={0} y2={-f.size + 1} stroke="#6b4a36" strokeWidth={1.4} />
            <circle r={f.size} fill="url(#tr-fruit)" />
            <path d={`M${-f.size * 0.32} ${-f.size * 0.9}l${f.size * 0.16} ${-f.size * 0.34}l${f.size * 0.16} ${f.size * 0.22}l${f.size * 0.16} ${-f.size * 0.22}l${f.size * 0.16} ${f.size * 0.34}`} fill="#b8323f" />
            <ellipse cx={-f.size * 0.35} cy={-f.size * 0.3} rx={f.size * 0.22} ry={f.size * 0.32} fill="#fff" opacity={0.28} />
          </g>
        </g>
      ))}
    </>
  );
}

function Ground({ cx, w }: { cx: number; w: number }) {
  const blades = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 70; i++) {
      const x = cx - w * 0.45 + ((i * 97) % 1000) / 1000 * w * 0.9;
      const hgt = 5 + ((i * 53) % 9);
      const lean = ((i * 31) % 7) - 3;
      out.push(`M${x.toFixed(1)} 6Q${(x + lean * 0.4).toFixed(1)} ${(6 - hgt * 0.6).toFixed(1)} ${(x + lean).toFixed(1)} ${(6 - hgt).toFixed(1)}`);
    }
    return out;
  }, [cx, w]);
  return (
    <g>
      <ellipse cx={cx} cy={30} rx={w * 0.62} ry={34} fill="url(#tr-ground)" />
      <path d={blades.join("")} stroke="#2fbf86" strokeOpacity={0.45} strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </g>
  );
}

function Fireflies({ n, canopy }: { n: number; canopy: { x: number; y: number; rx: number; ry: number } }) {
  const flies = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const a = (i * 137.5 * Math.PI) / 180;
        const r = Math.sqrt((i + 0.5) / n);
        // Rounded: trig can differ in the last digit between server and browser.
        return {
          x: Math.round(canopy.x + Math.cos(a) * r * canopy.rx),
          y: Math.round(canopy.y + Math.sin(a) * r * canopy.ry),
          dur: 5 + (i % 5),
          delay: (i * 0.37) % 4,
        };
      }),
    [n, canopy.x, canopy.y, canopy.rx, canopy.ry],
  );
  return (
    <g className="tr-flies">
      {flies.map((f, i) => (
        <circle
          key={i}
          cx={f.x}
          cy={f.y}
          r={1.8}
          fill="#d9ffb0"
          style={{ animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` } as CSSProperties}
        />
      ))}
    </g>
  );
}

function Defs() {
  const leafColors: Record<Prayer, [string, string]> = {
    fajr: ["#9cf7d8", "#2fbf9a"],
    dhuhr: ["#86efac", "#22a05a"],
    asr: ["#c7f27a", "#5ea82a"],
    maghrib: ["#6ee7b7", "#13966a"],
    isha: ["#5eead4", "#127a7f"],
  };
  return (
    <defs>
      <symbol id="tr-leaf" overflow="visible">
        <path d="M0 0C.42-.5.46-1.32 0-1.8C-.46-1.32-.42-.5 0 0Z" />
        <path d="M0-.1V-1.55" stroke="#ffffff" strokeOpacity={0.3} strokeWidth={0.07} fill="none" />
      </symbol>
      {(Object.keys(leafColors) as Prayer[]).map((p) => (
        <linearGradient key={p} id={`tr-leaf-${p}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={leafColors[p][0]} />
          <stop offset="1" stopColor={leafColors[p][1]} />
        </linearGradient>
      ))}
      <radialGradient id="tr-petal">
        <stop offset="0" stopColor="#fff2f8" />
        <stop offset="1" stopColor="#f6a6cf" />
      </radialGradient>
      <radialGradient id="tr-fruit" cx="0.38" cy="0.35">
        <stop offset="0" stopColor="#ff8a8a" />
        <stop offset="0.6" stopColor="#d9364a" />
        <stop offset="1" stopColor="#8e1d33" />
      </radialGradient>
      <radialGradient id="tr-halo">
        <stop offset="0" stopColor="#2fe1c4" stopOpacity={0.28} />
        <stop offset="0.55" stopColor="#2fe1c4" stopOpacity={0.08} />
        <stop offset="1" stopColor="#2fe1c4" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="tr-ground" cx="0.5" cy="0.2">
        <stop offset="0" stopColor="#1d4d3f" />
        <stop offset="0.7" stopColor="#10271f" />
        <stop offset="1" stopColor="#10271f" stopOpacity={0} />
      </radialGradient>
      <filter id="tr-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2.2" result="b" />
        <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.2  0 0 0 0 1  0 0 0 0 0.6  0 0 0 0.55 0" result="g" />
        <feMerge>
          <feMergeNode in="g" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

function Sky() {
  const stars = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: `${((i * 61.8) % 100).toFixed(2)}%`,
        top: `${((i * 37.3) % 62).toFixed(2)}%`,
        size: 1 + (i % 3) * 0.6,
        delay: `${(i * 0.29) % 5}s`,
      })),
    [],
  );
  return (
    <div className="tree-sky" aria-hidden>
      {stars.map((s, i) => (
        <span key={i} className="tree-star" style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }} />
      ))}
      <svg className="tree-moon" viewBox="0 0 40 40">
        <path d="M27 6a15 15 0 1 0 7 26A12 12 0 1 1 27 6Z" fill="#f6ecc9" />
      </svg>
    </div>
  );
}
