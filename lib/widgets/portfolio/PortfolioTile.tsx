"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { PortfolioData, PositionRow, SeriesPoint } from ".";
import { PERIODS, type PeriodKey } from "./periods";
import { Tile, Empty } from "@/components/ui";
import { money } from "@/lib/format";
import { HoldingsEditor } from "./HoldingsEditor";

/**
 * One period at a time, chosen from the tabs in the header: the net change
 * with its gains/losses split, the portfolio's value line through that
 * period (hover it), and the biggest movers. Click the tile open for every
 * holding. No tilt — at full width the 3D parallax stretches the header past
 * the card's edges.
 */
export function PortfolioTile({ data }: { data: PortfolioData }) {
  const [period, setPeriod] = useState<PeriodKey>("1D");

  if (data.rows.length === 0) {
    return (
      <Tile title="Portfolio" sub="Stocks & ETFs" tilt={false}>
        <Empty>Add what you own and Pillar prices it for you. Enter a ticker, how many shares, and what you paid in total.</Empty>
        <HoldingsEditor rows={[]} />
      </Tile>
    );
  }

  const p = data.periods.find((x) => x.key === period)!;
  const label = PERIODS.find((x) => x.key === period)!.label;
  const up = p.netCents >= 0;

  // Segregated funds and the like: real value, no feed behind it.
  const stated = data.rows.filter((r) => r.valuedOn);
  const statedOn = stated
    .map((r) => r.valuedOn!)
    .sort()[0]
    ?.slice(5)
    .replace("-", "/");

  const ranked = data.rows
    .filter((r) => r.changes[period])
    .sort((a, b) => b.changes[period]!.cents - a.changes[period]!.cents);

  return (
    <Tile
      title="Portfolio"
      tilt={false}
      sub={
        data.stale ? (
          <span className="text-warn">Prices cached — feed unavailable</span>
        ) : (
          "Stocks, ETFs & crypto"
        )
      }
      right={
        <div className="flex items-center gap-5">
          <PeriodTabs value={period} onChange={setPeriod} />
          <div>
            <div className="tnum text-lg font-semibold leading-none">
              {money(data.totalValueCents)}
            </div>
            <div className="mt-1 text-[0.6rem] uppercase tracking-wider text-faint">
              Worth today
            </div>
          </div>
        </div>
      }
    >
      <div className="mt-2 flex min-h-[72px] flex-1 flex-col gap-4 md:flex-row md:gap-6 in-[.is-expanded]:h-60 in-[.is-expanded]:flex-none">
        {/* ── the headline ── */}
        <div className="flex shrink-0 flex-col justify-center md:w-56">
          <div className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-faint">
            {label}
          </div>
          <div className="flex items-baseline gap-2">
            <AnimatedMoney
              cents={p.netCents}
              className={`tnum text-[1.7rem] font-semibold leading-tight ${
                up ? "text-teal" : "text-bad"
              }`}
              style={{
                textShadow: `0 0 18px color-mix(in oklab, var(--color-${up ? "teal" : "bad"}) 40%, transparent)`,
              }}
            />
            <span
              className={`tnum rounded-pill px-1.5 py-px text-[0.66rem] font-semibold ${
                up ? "bg-teal/15 text-teal" : "bg-bad/15 text-bad"
              }`}
            >
              {up ? "▲" : "▼"} {Math.abs(p.netPct).toFixed(1)}%
            </span>
          </div>
          <div className="tnum mt-1 flex gap-3 text-[0.68rem]">
            <span className="text-teal" title={`${p.up} holdings up`}>
              ▲ {money(p.gainsCents)}{" "}
              <span className="text-faint">· {p.up}</span>
            </span>
            <span className="text-bad" title={`${p.down} holdings down`}>
              ▼ {money(Math.abs(p.lossesCents))}{" "}
              <span className="text-faint">· {p.down}</span>
            </span>
          </div>
        </div>

        {/* ── the picture ── */}
        <div className="relative min-h-[72px] min-w-0 flex-1">
          {p.series.length > 1 ? (
            <PerfChart key={period} series={p.series} period={period} />
          ) : (
            <ContributionStrip key={period} rows={ranked} period={period} />
          )}
        </div>

        {/* ── who moved it ── */}
        <Movers rows={ranked} period={period} />
      </div>

      {/* Only once the tile is clicked open: every holding, ranked. */}
      <div className="hidden in-[.is-expanded]:block">
        <HoldingsList rows={ranked} period={period} />
        <p className="mt-3 font-mono text-[0.62rem] leading-relaxed text-faint">
          {data.fetchedAt &&
            `Priced ${new Date(data.fetchedAt).toLocaleTimeString("en-CA", {
              timeZone: "America/Toronto",
              hour: "numeric",
              minute: "2-digit",
            })} · `}
          Cost {money(data.totalCostCents)} · US holdings at today&apos;s USD/CAD ·
          1W–1Y assume today&apos;s share counts
          {data.unpriced > 0 && ` · ${data.unpriced} unpriced, left out`}
          {stated.length > 0 &&
            ` · ${stated.length} valued from statement (${statedOn}) — counted in the total and all-time, but has no daily price`}
        </p>
        <h4 className="mt-5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-faint">Edit holdings</h4>
        <HoldingsEditor rows={data.rows} />
      </div>
    </Tile>
  );
}

/* ── period tabs: a segmented control with a sliding thumb ── */

function PeriodTabs({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (k: PeriodKey) => void;
}) {
  const i = PERIODS.findIndex((p) => p.key === value);

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = PERIODS[(i + step + PERIODS.length) % PERIODS.length].key;
    onChange(next);
    (e.currentTarget.querySelector(`[data-k="${next}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Performance period"
      onKeyDown={onKey}
      className="relative grid w-[19rem] grid-cols-6 rounded-pill border border-line bg-surface-hi/50 p-0.5"
    >
      <span
        aria-hidden="true"
        className="pf-thumb absolute inset-y-0.5 left-0.5 rounded-[5px]"
        style={{
          width: "calc((100% - 4px) / 6)",
          transform: `translateX(${i * 100}%)`,
        }}
      />
      {PERIODS.map(({ key, label }) => (
        <button
          key={key}
          data-k={key}
          role="tab"
          aria-selected={key === value}
          tabIndex={key === value ? 0 : -1}
          title={label}
          onClick={() => onChange(key)}
          className={`relative z-10 py-1 font-mono text-[0.68rem] font-semibold transition-colors duration-200 ${
            key === value ? "text-[#10202c]" : "text-muted hover:text-ink"
          }`}
        >
          {key}
        </button>
      ))}
    </div>
  );
}

/* ── the value line, split green above / red below where the period began ── */

function PerfChart({ series, period }: { series: SeriesPoint[]; period: PeriodKey }) {
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const W = 1000;
  const H = 100;

  const vals = series.map((s) => s.v);
  const start = vals[0];
  const lo = Math.min(...vals, start);
  const hi = Math.max(...vals, start);
  const pad = (hi - lo || 1) * 0.12;
  const y = (v: number) => H - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * H;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const baseY = y(start);

  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${line}L${W},${baseY.toFixed(1)}L0,${baseY.toFixed(1)}Z`;

  const at = hover ?? series.length - 1;
  const pt = series[at];
  const diff = pt.v - start;
  const hx = (x(at) / W) * 100;
  const hy = (y(pt.v) / H) * 100;

  return (
    <div
      className="absolute inset-0 cursor-crosshair"
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const f = (e.clientX - box.left) / box.width;
        setHover(Math.max(0, Math.min(series.length - 1, Math.round(f * (series.length - 1)))));
      }}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
        role="img"
        aria-label={`Portfolio value over ${period}: ${money(start)} to ${money(vals.at(-1)!)}`}
      >
        <defs>
          <clipPath id={`above-${uid}`}>
            <rect x="0" y="-10" width={W} height={baseY + 10} />
          </clipPath>
          <clipPath id={`below-${uid}`}>
            <rect x="0" y={baseY} width={W} height={H - baseY + 10} />
          </clipPath>
          <linearGradient id={`gu-${uid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-teal)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-teal)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`gd-${uid}`} x1="0" x2="0" y1="1" y2="0">
            <stop offset="0%" stopColor="var(--color-bad)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-bad)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <g className="pf-fade">
          <path d={area} fill={`url(#gu-${uid})`} clipPath={`url(#above-${uid})`} />
          <path d={area} fill={`url(#gd-${uid})`} clipPath={`url(#below-${uid})`} />
        </g>
        {/* Where the period started — above it is a gain, below a loss. */}
        <line
          x1="0"
          x2={W}
          y1={baseY}
          y2={baseY}
          stroke="var(--color-faint)"
          strokeWidth="1"
          strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
          opacity="0.6"
        />
        {(["above", "below"] as const).map((side) => (
          <path
            key={side}
            d={line}
            pathLength={1}
            className="pf-draw"
            fill="none"
            stroke={side === "above" ? "var(--color-teal)" : "var(--color-bad)"}
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            clipPath={`url(#${side}-${uid})`}
          />
        ))}
      </svg>

      {/* HTML overlays, so the dot and label don't stretch with the SVG. */}
      {hover != null && (
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-muted/40"
          style={{ left: `${hx}%` }}
        />
      )}
      <span
        className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#10202c] ${
          diff >= 0 ? "bg-teal text-teal" : "bg-bad text-bad"
        } ${hover == null ? "pf-pulse" : ""}`}
        style={{ left: `${hx}%`, top: `${hy}%` }}
      />
      <div
        className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-ctl border border-line bg-surface/95 px-2 py-1 font-mono text-[0.62rem] shadow-lg backdrop-blur"
        style={{
          left: `${hx}%`,
          transform: `translateX(${hx > 75 ? "-105%" : hx < 25 ? "5%" : "-50%"})`,
        }}
      >
        <span className="text-faint">{when(pt.t, period, hover == null)}</span>{" "}
        <span className="text-ink">{money(pt.v)}</span>{" "}
        <span className={diff >= 0 ? "text-teal" : "text-bad"}>
          {money(diff, { sign: true })}
        </span>
      </div>
    </div>
  );
}

function when(t: number, period: PeriodKey, isNow: boolean) {
  if (isNow) return "Now";
  const d = new Date(t);
  return period === "1D"
    ? d.toLocaleTimeString("en-CA", {
        timeZone: "America/Toronto",
        hour: "numeric",
        minute: "2-digit",
      })
    : d.toLocaleDateString("en-CA", {
        timeZone: "America/Toronto",
        month: "short",
        day: "numeric",
        ...(period === "1Y" || period === "6M" ? { year: "2-digit" } : {}),
      });
}

/* ── All Time: each holding's share of the total gain or loss ── */

function ContributionStrip({ rows, period }: { rows: PositionRow[]; period: PeriodKey }) {
  const [hover, setHover] = useState<string | null>(null);
  const gains = rows.filter((r) => r.changes[period]!.cents > 0);
  const losses = rows.filter((r) => r.changes[period]!.cents < 0).reverse();
  const sum = (list: PositionRow[]) =>
    list.reduce((n, r) => n + Math.abs(r.changes[period]!.cents), 0);
  const top = Math.max(sum(gains), sum(losses), 1);

  const strip = (list: PositionRow[], tone: "teal" | "bad") => (
    <div className="flex h-7 gap-px overflow-hidden rounded-[5px]" style={{ width: `${(sum(list) / top) * 100}%` }}>
      {list.map((r) => {
        const c = r.changes[period]!;
        const share = (Math.abs(c.cents) / sum(list)) * 100;
        const id = `${r.symbol}:${r.label}`;
        return (
          <div
            key={id}
            onPointerEnter={() => setHover(id)}
            onPointerLeave={() => setHover(null)}
            title={`${r.symbol} ${money(c.cents, { sign: true })}`}
            className={`pf-grow flex min-w-0 items-center justify-center overflow-hidden font-mono text-[0.58rem] font-semibold transition-opacity duration-150 ${
              tone === "teal" ? "bg-teal/70 text-[#10202c]" : "bg-bad/70 text-white"
            } ${hover && hover !== id ? "opacity-40" : ""}`}
            style={{ width: `${share}%` }}
          >
            {share > 7 ? r.symbol.replace(/\.TO$/, "") : ""}
          </div>
        );
      })}
    </div>
  );

  const h = rows.find((r) => `${r.symbol}:${r.label}` === hover);

  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-1.5">
      <div className="flex items-center justify-between font-mono text-[0.6rem] text-faint">
        <span>What each holding added or lost, vs what you paid</span>
        {h && (
          <span className="text-ink">
            {h.symbol}{" "}
            <span className={h.changes[period]!.cents >= 0 ? "text-teal" : "text-bad"}>
              {money(h.changes[period]!.cents, { sign: true })}
            </span>
          </span>
        )}
      </div>
      {strip(gains, "teal")}
      {strip(losses, "bad")}
    </div>
  );
}

/* ── best and worst for the period ── */

function Movers({ rows, period }: { rows: PositionRow[]; period: PeriodKey }) {
  const best = rows.filter((r) => r.changes[period]!.cents > 0).slice(0, 3);
  const worst = rows
    .filter((r) => r.changes[period]!.cents < 0)
    .slice(-3)
    .reverse();

  const col = (title: string, list: PositionRow[]) => (
    <div className="min-w-0">
      <div className="mb-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-faint">
        {title}
      </div>
      {list.length === 0 && <div className="text-[0.66rem] text-faint">—</div>}
      {list.map((r) => {
        const c = r.changes[period]!;
        return (
          <div
            key={`${r.symbol}:${r.label}`}
            className="-mx-1.5 flex items-center justify-between gap-2 rounded-[4px] px-1.5 py-[1px] transition-colors hover:bg-surface-hi/70"
            title={r.label ?? undefined}
          >
            <span className="truncate font-mono text-[0.68rem] font-medium">
              {r.symbol.replace(/\.TO$/, "")}
            </span>
            <span
              className={`tnum shrink-0 font-mono text-[0.66rem] ${
                c.cents >= 0 ? "text-teal" : "text-bad"
              }`}
            >
              {money(c.cents, { sign: true })}
              {c.pct != null && (
                <span className="ml-1 text-faint">
                  {c.pct >= 0 ? "+" : ""}
                  {c.pct.toFixed(1)}%
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="hidden shrink-0 grid-cols-2 content-center gap-5 md:grid md:w-[21rem]">
      {col("Top movers", best)}
      {col("Biggest drags", worst)}
    </div>
  );
}

/* ── expanded view: every holding with a diverging bar ── */

function HoldingsList({ rows, period }: { rows: PositionRow[]; period: PeriodKey }) {
  // Scaled by dollars, not percent: one +500% position would otherwise
  // flatten every other bar to a sliver.
  const maxCents = Math.max(...rows.map((r) => Math.abs(r.changes[period]!.cents)), 1);
  return (
    <div className="mt-5 grid grid-cols-1 gap-x-8 border-t border-line-soft pt-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => {
        const c = r.changes[period]!;
        const w = (Math.abs(c.cents) / maxCents) * 50;
        const pos = c.cents >= 0;
        return (
          <div
            key={`${r.symbol}:${r.label}`}
            className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-3 border-b border-line-soft/50 py-1.5"
            title={
              r.valuedOn
                ? `${r.label ?? r.symbol} — valued from your statement of ${r.valuedOn}`
                : (r.label ?? undefined)
            }
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-xs font-medium">
                {r.symbol.replace(/\.TO$/, "")}
              </div>
              <div className="tnum text-[0.62rem] text-faint">{money(r.valueCents!)}</div>
            </div>
            <div className="relative h-2 rounded-full bg-surface-hi/60">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <div
                className={`pf-grow absolute inset-y-0 min-w-[3px] rounded-full ${pos ? "bg-teal" : "bg-bad"}`}
                style={pos ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
              />
            </div>
            <div className={`tnum text-right font-mono text-[0.68rem] ${pos ? "text-teal" : "text-bad"}`}>
              {money(c.cents, { sign: true })}
              <div className="text-[0.6rem] text-faint">
                {c.pct == null ? "" : `${c.pct >= 0 ? "+" : ""}${c.pct.toFixed(1)}%`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── the headline number rolls to its new value on a period switch ── */

function AnimatedMoney({
  cents,
  className,
  style,
}: {
  cents: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [shown, setShown] = useState(cents);
  const from = useRef(cents);

  useEffect(() => {
    const start = from.current;
    if (start === cents) return;
    // Reduced motion still goes through one frame — it just lands at once.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(start + (cents - start) * eased);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cents]);

  return (
    <span className={className} style={style}>
      {money(shown, { sign: true })}
    </span>
  );
}
