/**
 * The Prayer Tree, as geometry. Pure and client-safe: the page recomputes it
 * on every frame of the "watch it grow" playback, so it must stay fast and
 * must give the same tree for the same history every time.
 *
 * The mapping, kept deliberately literal so people can read their tree:
 *   every prayer prayed   → a leaf
 *   every day             → a twig (longer the more prayers it holds)
 *   every week            → a branch;  all 7 days full → it blossoms
 *   every month           → a limb off the trunk;  every day full → fruit
 *
 * A missed prayer is never shown as damage. It leaves a small dormant bud in
 * the leaf's place, and the tree keeps growing the moment they come back.
 *
 * Coordinates: the trunk's base is (0, 0) and "up" is negative y, so the tree
 * can grow as tall as it likes and the page fits the view to its bounds.
 * Older limbs never move as newer ones appear; they only lengthen with age,
 * the way a real tree's lower branches do.
 */

export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type Prayer = (typeof PRAYERS)[number];

export type Segment = {
  id: string;
  /** The centre line ("M … Q …"): a stroke for twigs, the highlight for wood. */
  d: string;
  /** A filled outline that tapers from base to tip; set for everything but twigs. */
  shape?: string;
  width: number;
  kind: "trunk" | "limb" | "branch" | "twig" | "root";
  /** Days since the first day: drives the growth animation's order. */
  day: number;
  future: boolean;
};

export type Leaf = {
  id: string;
  x: number;
  y: number;
  /** Degrees, the leaf's long axis. */
  angle: number;
  size: number;
  prayer: Prayer;
  date: string;
  day: number;
  /** Prayed: a lit leaf. Not prayed: a dormant bud waiting in its place. */
  lit: boolean;
  today: boolean;
  future: boolean;
};

/** A blossom (full week) or fruit (full month), with the days it stands for. */
export type Bloom = { id: string; x: number; y: number; size: number; day: number; future: boolean; from: string; to: string };

export type TreeModel = {
  segments: Segment[];
  leaves: Leaf[];
  blossoms: Bloom[];
  fruit: Bloom[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  totalDays: number;
  stats: {
    prayers: number;
    fullDays: number;
    fullWeeks: number;
    fullMonths: number;
    streak: number;
    bestStreak: number;
  };
};

/* ── dates ─────────────────────────────────────────────────────── */

const toUTC = (d: string) => Date.parse(`${d}T12:00:00Z`);
const fromUTC = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromUTC(toUTC(d) + n * 86_400_000);
export const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
const daysInMonth = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

/* ── a seeded random, so a given day's twig always grows the same way ── */

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── geometry helpers ──────────────────────────────────────────── */

type Pt = { x: number; y: number };
const rad = (deg: number) => (deg * Math.PI) / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A gently curved limb: start, a control point bowed upward, end. */
type Curve = { p0: Pt; p1: Pt; p2: Pt };

function curve(from: Pt, angleDeg: number, length: number, lift: number): Curve {
  // angle 0 = straight up, positive = leaning right.
  const dir = { x: Math.sin(rad(angleDeg)), y: -Math.cos(rad(angleDeg)) };
  const p2 = { x: from.x + dir.x * length, y: from.y + dir.y * length };
  // The control point sits above the chord, so every branch reaches for the light.
  const mid = { x: (from.x + p2.x) / 2, y: (from.y + p2.y) / 2 };
  return { p0: from, p1: { x: mid.x - dir.x * length * 0.08, y: mid.y - length * lift }, p2 };
}

function at(c: Curve, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * c.p0.x + 2 * u * t * c.p1.x + t * t * c.p2.x,
    y: u * u * c.p0.y + 2 * u * t * c.p1.y + t * t * c.p2.y,
  };
}

/** Direction of travel along the curve at t, in degrees (0 = up). */
function heading(c: Curve, t: number): number {
  const dx = 2 * (1 - t) * (c.p1.x - c.p0.x) + 2 * t * (c.p2.x - c.p1.x);
  const dy = 2 * (1 - t) * (c.p1.y - c.p0.y) + 2 * t * (c.p2.y - c.p1.y);
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** Points along a curve, for building a tapered outline. */
const sample = (c: Curve, n = 14): Pt[] => Array.from({ length: n }, (_, i) => at(c, i / (n - 1)));

const f1 = (p: Pt) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

/**
 * A closed outline around a centre line, w0 wide at the base and w1 at the
 * tip. One continuous shape reads as wood; a run of round-capped strokes
 * shows its joints the moment someone zooms in.
 */
function ribbon(pts: Pt[], w0: number, w1: number): string {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const w = lerp(w0, w1, i / (pts.length - 1)) / 2;
    left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
    right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }
  const tip = pts[pts.length - 1];
  // A rounded tip, so a limb ends like a branch and not a cut plank.
  return (
    `M${f1(left[0])}` +
    left.slice(1).map((p) => `L${f1(p)}`).join("") +
    `Q${f1({ x: tip.x + (tip.x - pts[pts.length - 2].x) * 0.6, y: tip.y + (tip.y - pts[pts.length - 2].y) * 0.6 })} ${f1(right[right.length - 1])}` +
    right
      .slice(0, -1)
      .reverse()
      .map((p) => `L${f1(p)}`)
      .join("") +
    "Z"
  );
}

const pathOf = (c: Curve) =>
  `M${c.p0.x.toFixed(1)} ${c.p0.y.toFixed(1)}Q${c.p1.x.toFixed(1)} ${c.p1.y.toFixed(1)} ${c.p2.x.toFixed(1)} ${c.p2.y.toFixed(1)}`;

/* ── the tree ──────────────────────────────────────────────────── */

export type GrowInput = {
  /** First day of the tree: the day of their first logged prayer, or today. */
  start: string;
  /** Last real day to draw (today, or an earlier day while scrubbing). */
  end: string;
  today: string;
  /** Prayers logged per date. */
  prayed: Record<string, Prayer[]>;
  /** Draw imagined future days up to this date, every prayer prayed: the "potential" view. */
  projectTo?: string;
};

export function growTree(input: GrowInput): TreeModel {
  const { start, end, today, prayed } = input;
  const last = input.projectTo && input.projectTo > end ? input.projectTo : end;
  const totalDays = Math.max(1, daysBetween(start, last) + 1);

  // Every day, grouped into calendar months and 7-day weeks within them.
  type Day = { date: string; index: number; set: Set<Prayer>; future: boolean };
  const months = new Map<string, Day[][]>();
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(start, i);
    const future = date > end;
    const set = new Set<Prayer>(future ? PRAYERS : (prayed[date] ?? []));
    const ym = date.slice(0, 7);
    const week = Math.floor((Number(date.slice(8, 10)) - 1) / 7);
    if (!months.has(ym)) months.set(ym, []);
    const weeks = months.get(ym)!;
    (weeks[week] ??= []).push({ date, index: i, set, future });
  }
  const monthList = [...months.entries()].map(([ym, weeks]) => ({ ym, weeks: weeks.filter(Boolean) }));
  const M = monthList.length;

  const segments: Segment[] = [];
  const leaves: Leaf[] = [];
  const blossoms: Bloom[] = [];
  const fruit: Bloom[] = [];

  /* trunk: each month raises it, by a little less every time */
  const step = (i: number) => 44 * Math.pow(0.95, i);
  const attachHeight: number[] = [];
  let h = 56;
  for (let i = 0; i < M; i++) {
    attachHeight.push(h);
    h += step(i);
  }
  const trunkHeight = h + 30;
  const r0 = rng("trunk");
  const sway = r0() * 6.28;
  const trunkX = (y: number) => Math.sin(sway + (y / trunkHeight) * 2.4) * Math.min(16, 4 + M * 0.9) * (y / trunkHeight);
  const baseWidth = 9 + Math.min(M, 18) * 2.4;
  const trunkWidth = (y: number) => lerp(baseWidth, Math.max(3, baseWidth * 0.22), y / trunkHeight);

  const trunkPts: Pt[] = Array.from({ length: 26 }, (_, i) => {
    const y = (trunkHeight * i) / 25;
    return { x: trunkX(y), y: -y };
  });
  const trunkLine = `M${trunkPts.map(f1).join("L")}`;
  // Flared at the root collar, tapering to the crown.
  const flare = (y: number) => trunkWidth(y) * (1 + 0.45 * Math.max(0, 1 - y / (baseWidth * 2.2)));
  {
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (const p of trunkPts) {
      const w = flare(-p.y) / 2;
      left.push({ x: p.x - w, y: p.y });
      right.push({ x: p.x + w, y: p.y });
    }
    const top = trunkPts[trunkPts.length - 1];
    segments.push({
      id: "trunk",
      d: trunkLine,
      shape:
        `M${left.map(f1).join("L")}Q${f1({ x: top.x, y: top.y - trunkWidth(trunkHeight) * 0.6 })} ${f1(right[right.length - 1])}L` +
        right.slice(0, -1).reverse().map(f1).join("L") +
        "Z",
      width: baseWidth,
      kind: "trunk",
      day: 0,
      future: false,
    });
  }

  /* roots: a few, more as the tree ages, so it looks planted */
  const roots = Math.min(7, 2 + Math.floor(M / 2));
  for (let k = 0; k < roots; k++) {
    const r = rng(`root-${k}`);
    const side = k % 2 ? 1 : -1;
    const ang = side * (95 + r() * 25);
    const c = curve({ x: side * baseWidth * 0.2, y: -2 }, ang, 18 + Math.min(M, 14) * 3.2 + r() * 14, -0.12);
    segments.push({
      id: `root-${k}`,
      d: pathOf(c),
      shape: ribbon(sample(c, 10), baseWidth * 0.42, baseWidth * 0.06),
      width: baseWidth * 0.3,
      kind: "root",
      day: 0,
      future: false,
    });
  }

  let prayersLit = 0;
  let fullDays = 0;
  let fullWeeks = 0;
  let fullMonths = 0;

  monthList.forEach(({ ym, weeks }, mi) => {
    const r = rng(`m-${ym}`);
    const age = M - 1 - mi;
    // Alternate sides, with a nudge of randomness so it never looks like a ladder.
    const side = (mi % 2 === 0 ? -1 : 1) * (r() < 0.12 ? -1 : 1);
    const y = attachHeight[mi];
    const tFrac = y / trunkHeight;
    const youngest = mi === M - 1;
    const angle = youngest && M > 1 ? side * (16 + r() * 10) : side * lerp(76, 44, tFrac) + (r() - 0.5) * 12;
    // Lower limbs reach widest, like an old oak; the crown stays rounded.
    const reach = lerp(1, 0.62, Math.pow(tFrac, 1.4));
    const length = ((youngest && M <= 1 ? 74 : 112) + Math.min(age, 14) * 19 + r() * 30) * reach;
    const limb = curve({ x: trunkX(y), y: -y }, angle, length, 0.16 + r() * 0.08);
    const limbWidth = trunkWidth(y) * 0.6;
    const monthDays = weeks.flat();
    const firstDay = monthDays[0].index;
    segments.push({
      id: `limb-${ym}`,
      d: pathOf(limb),
      shape: ribbon(sample(limb, 16), limbWidth, Math.max(1.6, limbWidth * 0.28)),
      width: limbWidth,
      kind: "limb",
      day: firstDay,
      future: monthDays[0].future,
    });

    let monthFull = monthDays.length === daysInMonth(ym);

    weeks.forEach((week, wi) => {
      const rw = rng(`w-${ym}-${wi}`);
      const s = 0.28 + (0.68 * (wi + 0.5)) / weeks.length;
      const base = at(limb, s);
      const wSide = wi % 2 === 0 ? 1 : -1;
      const wAngle = heading(limb, s) + wSide * (30 + rw() * 22);
      const wLen = (60 + rw() * 28) * lerp(1.05, 0.72, s) * (1 + Math.min(age, 10) * 0.05);
      const branch = curve(base, wAngle, wLen, 0.14);
      segments.push({
        id: `branch-${ym}-${wi}`,
        d: pathOf(branch),
        shape: ribbon(sample(branch, 10), Math.max(1.8, limbWidth * 0.5), 0.9),
        width: Math.max(1.6, limbWidth * 0.45),
        kind: "branch",
        day: week[0].index,
        future: week[0].future,
      });

      let weekFull = week.length === 7;

      week.forEach((day, di) => {
        const rd = rng(`d-${day.date}`);
        const u = 0.22 + (0.74 * (di + 0.5)) / week.length;
        const tb = at(branch, u);
        const dSide = di % 2 === 0 ? -1 : 1;
        const count = day.set.size;
        const full = count === 5;
        const isToday = day.date === today;
        if (full && !day.future) fullDays++;
        if (!full) {
          weekFull = false;
          monthFull = false;
        }
        prayersLit += day.future ? 0 : count;

        const dAngle = heading(branch, u) + dSide * (26 + rd() * 26);
        // A day with no prayers grows no twig; its bud waits on the branch.
        const twigLen = count === 0 ? 0 : 9 + count * 4.2 + rd() * 4;
        const twig = curve(tb, dAngle, Math.max(twigLen, 0.01), 0.1);
        if (count > 0) {
          segments.push({
            id: `twig-${day.date}`,
            d: pathOf(twig),
            width: full ? 1.7 : 1.15,
            kind: "twig",
            day: day.index,
            future: day.future,
          });
        }

        PRAYERS.forEach((p, pi) => {
          const lit = day.set.has(p);
          // Upcoming prayers today aren't buds yet: nothing has been missed.
          if (!lit && isToday) return;
          const f = count === 0 ? 0 : 0.3 + (0.7 * pi) / 4;
          const pos = count === 0 ? tb : at(twig, f);
          const lSide = pi % 2 === 0 ? 1 : -1;
          const twigHeading = count === 0 ? dAngle : heading(twig, f);
          const angle = twigHeading + lSide * (38 + rd() * 22) + (pi === 4 ? -lSide * 30 : 0);
          leaves.push({
            id: `leaf-${day.date}-${p}`,
            x: pos.x + (count === 0 ? (pi - 2) * 2.2 : 0),
            y: pos.y,
            angle,
            size: lit ? 6.4 + rd() * 2.6 + (full ? 0.8 : 0) : 1.1,
            prayer: p,
            date: day.date,
            day: day.index,
            lit,
            today: isToday,
            future: day.future,
          });
        });
      });

      if (weekFull) {
        if (!week[0].future) fullWeeks++;
        const tip = branch.p2;
        blossoms.push({
          id: `bloom-${ym}-${wi}`,
          x: tip.x,
          y: tip.y,
          size: 7 + rw() * 2.5,
          day: week[week.length - 1].index,
          future: week[week.length - 1].future,
          from: week[0].date,
          to: week[week.length - 1].date,
        });
      }
    });

    if (monthFull) {
      if (!monthDays[0].future) fullMonths++;
      const p = at(limb, 0.78);
      fruit.push({
        id: `fruit-${ym}`,
        x: p.x,
        y: p.y + 14,
        size: 8.5 + Math.min(age, 6) * 0.4,
        day: monthDays[monthDays.length - 1].index,
        future: monthDays[0].future,
        from: monthDays[0].date,
        to: monthDays[monthDays.length - 1].date,
      });
    }
  });

  /* streaks, over real days only */
  let streak = 0;
  let best = 0;
  let run = 0;
  for (let i = 0; i <= daysBetween(start, end); i++) {
    const d = addDays(start, i);
    const n = prayed[d]?.length ?? 0;
    if (n === 5) best = Math.max(best, ++run);
    else if (d !== today) run = 0;
  }
  for (let d = end; d >= start; d = addDays(d, -1)) {
    const n = prayed[d]?.length ?? 0;
    if (n === 5) streak++;
    else if (d === today) continue;
    else break;
  }

  /* bounds, padded for leaves and the canopy glow */
  let minX = -40;
  let maxX = 40;
  let minY = -trunkHeight;
  const maxY = 30;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
  };
  for (const l of leaves) grow(l.x, l.y);
  for (const b of blossoms) grow(b.x, b.y);
  for (const b of fruit) grow(b.x, b.y);
  const pad = 26;

  return {
    segments,
    leaves,
    blossoms,
    fruit,
    bounds: { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY },
    totalDays,
    stats: { prayers: prayersLit, fullDays, fullWeeks, fullMonths, streak, bestStreak: best },
  };
}
