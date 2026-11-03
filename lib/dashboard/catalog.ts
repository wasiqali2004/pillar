/**
 * Everything the user can put on their dashboard, plus the rules for laying
 * it out. Deliberately free of server imports: onboarding and the Customize
 * mode run in the browser and read this same list, and the server-side
 * registry maps each id to the widget that actually loads and draws it.
 */

export type Span = 3 | 6 | 9 | 12;
export const SPANS: Span[] = [3, 6, 9, 12];

export const WIDGET_IDS = [
  "deen",
  "prayers",
  "quran",
  "body",
  "training",
  "habits",
  "goals",
  "meditation",
  "money",
  "portfolio",
  "business",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export type Category = "deen" | "body" | "growth" | "money";

export const CATEGORY_LABELS: Record<Category, string> = {
  deen: "Deen",
  body: "Body",
  growth: "Growth",
  money: "Money",
};

export type CatalogEntry = {
  id: WidgetId;
  title: string;
  blurb: string;
  category: Category;
  defaultSpan: Span;
  /** Widths the tile actually works at. Narrower ones squash its content. */
  spans: Span[];
  /** Widgets this one already contains; picking it removes them, and back. */
  replaces?: WidgetId[];
  /** Two rows tall on a wide screen. */
  tall?: boolean;
};

export const CATALOG: CatalogEntry[] = [
  {
    id: "deen",
    title: "Deen",
    blurb: "Prayer times and Qur'an memorization side by side in one tile.",
    category: "deen",
    defaultSpan: 6,
    spans: [6, 9, 12],
    replaces: ["prayers", "quran"],
  },
  {
    id: "prayers",
    title: "Prayers",
    blurb: "The five daily prayers for your city. Tap to log, keep your streak.",
    category: "deen",
    defaultSpan: 3,
    spans: [3, 6, 9, 12],
  },
  {
    id: "quran",
    title: "Qur'an",
    blurb: "Surahs you're memorizing, plus a reader that remembers where you stopped.",
    category: "deen",
    defaultSpan: 3,
    spans: [3, 6, 9, 12],
  },
  {
    id: "body",
    title: "Body",
    blurb: "Steps, sleep, calories, weight and workouts this week.",
    category: "body",
    defaultSpan: 3,
    spans: [3, 6, 9, 12],
  },
  {
    id: "training",
    title: "Training",
    blurb: "Workouts, PRs, a push/pull/legs calendar and a 3D muscle map.",
    category: "body",
    defaultSpan: 12,
    spans: [12],
    tall: true,
  },
  {
    id: "habits",
    title: "Habits",
    blurb: "A daily checklist with streaks, so small things don't slip.",
    category: "growth",
    defaultSpan: 3,
    spans: [3, 6, 9, 12],
  },
  {
    id: "goals",
    title: "Goals",
    blurb: "Monthly targets with progress bars that fill from your other widgets.",
    category: "growth",
    defaultSpan: 3,
    spans: [3, 6, 9, 12],
  },
  {
    id: "meditation",
    title: "Reflection",
    blurb: "One short reflection, refreshed every couple of hours.",
    category: "growth",
    defaultSpan: 3,
    spans: [3, 6, 9, 12],
  },
  {
    id: "money",
    title: "Money",
    blurb: "Spending this week and month, income, and where it's going.",
    category: "money",
    defaultSpan: 3,
    spans: [3, 6, 9, 12],
  },
  {
    id: "portfolio",
    title: "Portfolio",
    blurb: "Your holdings with gains and losses from 1 day to all time.",
    category: "money",
    defaultSpan: 12,
    spans: [6, 9, 12],
  },
  {
    id: "business",
    title: "Business revenue",
    blurb: "Shopify, or other apps you use to record sales. This week, month and year, with a 14-day chart.",
    category: "money",
    defaultSpan: 3,
    spans: [3, 6, 9, 12],
  },
];

export const CATALOG_BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

export type LayoutItem = { id: WidgetId; span: Span };

/* ── onboarding answers ─────────────────────────────────────── */

export const FAITHS = ["muslim", "other", "unsaid"] as const;
/** What they want to focus on. Each one switches on the widgets that serve it. */
export const WHYS = ["deen", "fitness", "health", "habits", "focus", "mind", "money", "business"] as const;
export type Why = (typeof WHYS)[number];

export type Answers = {
  /** Shapes what we suggest and how Rafiq talks; never gates anything. */
  faith: (typeof FAITHS)[number] | null;
  why: Why[];
  /** The same, in their own words. Optional, and passed to Rafiq. */
  intention: string;
};

export const EMPTY_ANSWERS: Answers = { faith: null, why: [], intention: "" };

export const INTENTION_MAX = 280;

const FOCUS_WIDGETS: Record<Why, WidgetId[]> = {
  deen: ["deen"],
  fitness: ["training", "body"],
  health: ["body"],
  habits: ["habits"],
  focus: ["goals"],
  mind: ["meditation"],
  money: ["money", "portfolio"],
  business: ["business"],
};

/** The order widgets land in when recommended, before the user rearranges. */
const RECOMMEND_ORDER: WidgetId[] = [
  "deen",
  "body",
  "meditation",
  "habits",
  "goals",
  "money",
  "business",
  "portfolio",
  "training",
];

/**
 * Muslims always start with prayer times and Qur'an. Everything else follows
 * what they said they want to focus on; skipping that question gets every
 * tracker, so nobody lands on an empty dashboard.
 */
export function recommend(a: Answers): WidgetId[] {
  const on = new Set<WidgetId>();
  const showDeen = a.faith === "muslim" || (a.faith !== "other" && a.why.includes("deen"));
  const focus = a.why.filter((w) => w !== "deen");
  const picks = focus.length ? focus : WHYS.filter((w) => w !== "deen");
  for (const w of picks) for (const id of FOCUS_WIDGETS[w]) on.add(id);
  if (showDeen) on.add("deen");
  return RECOMMEND_ORDER.filter((id) => on.has(id));
}

/**
 * Default widths for a fresh selection, nudged so each row of twelve fills:
 * when the next widget won't fit, the last one in the row widens into the gap
 * if its tile allows it. Only used for a starting point; the user can still
 * set any width they like afterwards.
 */
export function tidy(ids: WidgetId[]): LayoutItem[] {
  const out: LayoutItem[] = [];
  let used = 0;
  let rowStart = 0;
  const closeRow = () => {
    const gap = 12 - used;
    if (used > 0 && gap > 0) {
      for (let i = out.length - 1; i >= rowStart; i--) {
        const entry = CATALOG_BY_ID.get(out[i].id)!;
        const wider = (out[i].span + gap) as Span;
        if (entry.spans.includes(wider)) {
          out[i] = { ...out[i], span: wider };
          break;
        }
      }
    }
    used = 0;
    rowStart = out.length;
  };

  for (const id of ids) {
    const span = CATALOG_BY_ID.get(id)!.defaultSpan;
    if (used + span > 12) closeRow();
    out.push({ id, span });
    used += span;
    if (used === 12) closeRow();
  }
  closeRow();
  return out;
}

/** The nearest width this widget supports. */
export function fitSpan(id: WidgetId, span: number): Span {
  const allowed = CATALOG_BY_ID.get(id)?.spans ?? SPANS;
  return allowed.reduce((best, s) => (Math.abs(s - span) < Math.abs(best - span) ? s : best), allowed[0]);
}

/**
 * Makes any layout safe to render: unknown ids and duplicates dropped, widths
 * snapped to what each tile supports, and overlapping widgets resolved (Deen
 * already contains Prayers and Qur'an, so whichever came LAST wins).
 * Everything that writes a layout, including Rafiq, goes through this.
 */
export function normalizeLayout(items: unknown): LayoutItem[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<WidgetId>();
  const clean: LayoutItem[] = [];
  for (const raw of items) {
    const id = (raw as { id?: unknown })?.id;
    if (typeof id !== "string" || !CATALOG_BY_ID.has(id as WidgetId) || seen.has(id as WidgetId)) continue;
    seen.add(id as WidgetId);
    const span = Number((raw as { span?: unknown }).span);
    clean.push({ id: id as WidgetId, span: fitSpan(id as WidgetId, Number.isFinite(span) ? span : 6) });
  }

  // Walk backwards so the most recently placed of two overlapping widgets survives.
  const blocked = new Set<WidgetId>();
  const kept: LayoutItem[] = [];
  for (let i = clean.length - 1; i >= 0; i--) {
    const { id } = clean[i];
    if (blocked.has(id)) continue;
    kept.unshift(clean[i]);
    for (const r of CATALOG_BY_ID.get(id)!.replaces ?? []) blocked.add(r);
    for (const other of CATALOG) if (other.replaces?.includes(id)) blocked.add(other.id);
  }
  return kept;
}

export function normalizeAnswers(raw: unknown): Answers {
  const r = (raw ?? {}) as Partial<Record<keyof Answers, unknown>>;
  return {
    faith: FAITHS.includes(r.faith as "muslim") ? (r.faith as Answers["faith"]) : null,
    why: Array.isArray(r.why) ? (r.why.filter((x) => WHYS.includes(x as Why)) as Why[]) : [],
    intention: typeof r.intention === "string" ? r.intention.trim().slice(0, INTENTION_MAX) : "",
  };
}

/** Widgets that can't sit next to this one: what it contains, and what contains it. */
export function conflictsOf(id: WidgetId): WidgetId[] {
  return [
    ...(CATALOG_BY_ID.get(id)?.replaces ?? []),
    ...CATALOG.filter((c) => c.replaces?.includes(id)).map((c) => c.id),
  ];
}

/**
 * Puts a widget on the layout, at `at` or the end. Anything it overlaps with
 * comes off: adding Deen removes Prayers and Qur'an, and adding Prayers
 * removes Deen. Use this for every "add"; normalizeLayout only cleans up.
 */
export function placeWidget(items: LayoutItem[], id: WidgetId, span?: number, at?: number): LayoutItem[] {
  const drop = new Set<WidgetId>([id, ...conflictsOf(id)]);
  const rest = items.filter((i) => !drop.has(i.id));
  const idx = at === undefined ? rest.length : Math.max(0, Math.min(at, rest.length));
  rest.splice(idx, 0, { id, span: fitSpan(id, span ?? CATALOG_BY_ID.get(id)!.defaultSpan) });
  return rest;
}

/** Moves one entry to a new index, keeping the rest in order. */
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

export const SIZE_NAMES: Record<Span, string> = { 3: "S", 6: "M", 9: "L", 12: "Full" };

/**
 * The classic arrangement: every widget visible on one screen, three
 * rows of twelve, with Training as a full-width section below the fold.
 *
 *   row 1   deen 6 · body 3 · reflection 3
 *   row 2   habits 3 · goals 3 · money 3 · business revenue 3
 *   row 3   portfolio 12
 */
export const CLASSIC_LAYOUT: LayoutItem[] = [
  { id: "deen", span: 6 },
  { id: "body", span: 3 },
  { id: "meditation", span: 3 },
  { id: "habits", span: 3 },
  { id: "goals", span: 3 },
  { id: "money", span: 3 },
  { id: "business", span: 3 },
  { id: "portfolio", span: 12 },
  { id: "training", span: 12 },
];

/** How many rows of twelve the non-tall widgets fill, packed the way CSS grid will. */
export function rowCount(items: LayoutItem[]): number {
  let rows = 0;
  let used = 12;
  for (const i of items) {
    if (CATALOG_BY_ID.get(i.id)?.tall) continue;
    if (used + i.span > 12) {
      rows++;
      used = 0;
    }
    used += i.span;
  }
  return rows;
}

/* ── plans ──────────────────────────────────────────────────────
   Pillar is free for everyone for now. The plans below are kept for the paid
   version: when it's time, set BILLING_LIVE to true and wire up Stripe, and the
   plan picker, the Pro page and the upgrade buttons all come back. */

export const BILLING_LIVE = false;

export const PLAN_IDS = ["free", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** What a Pro plan includes before it stops. Each one is a cost that grows with the user. */
export const MAX_LINKED_BANKS = 3;
export const RAFIQ_MONTHLY_MESSAGES = 100;
/** Banks unlink themselves after this long without opening the app; Plaid bills for every link, used or not. */
export const INACTIVE_UNLINK_DAYS = 30;

export type PlanFeature = { text: string; soon?: boolean };

export type Plan = {
  id: PlanId;
  name: string;
  monthly: number;
  yearly: number | null;
  tagline: string;
  features: PlanFeature[];
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
    yearly: null,
    tagline: "Every tracker, free forever",
    features: [
      { text: "Habits, goals and a daily reflection" },
      { text: "Training, PRs and the 3D muscle map" },
      { text: "Body: steps, sleep and weight" },
      { text: "Money from bank statements, portfolio and business revenue" },
      { text: "Prayer times and Qur'an, for Muslims" },
      { text: "Arrange your dashboard your way" },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 4.99,
    yearly: 39.99,
    tagline: "The AI and the progress you can see",
    features: [
      { text: "Everything in Free" },
      { text: `Rafiq, your AI companion (${RAFIQ_MONTHLY_MESSAGES} messages a month)` },
      { text: `Automatic bank sync for up to ${MAX_LINKED_BANKS} accounts` },
      { text: "AI coach: weekly plan and check-ins", soon: true },
      { text: "The Prayer Tree: watch every prayer grow" },
      { text: "Accountability partners and groups", soon: true },
    ],
  },
];

/** What a plan costs per day, for the "or $0.17 per day" line on each card. */
export function perDay(price: number, yearly = false): string {
  return `$${(price / (yearly ? 365 : 30)).toFixed(2)}`;
}

export const PLAN_BY_ID = new Map(PLANS.map((p) => [p.id, p]));

/** Whether someone gets what Pro unlocks. With billing off, that's everyone. */
export function isPaid(plan: PlanId): boolean {
  return !BILLING_LIVE || plan !== "free";
}

/**
 * Plaid bills per linked account every month, so until there's revenue only the
 * owner can use automatic bank sync. Statement upload is open to everyone.
 */
export function bankSyncAllowed(plan: PlanId, isOwner: boolean): boolean {
  return isOwner || (BILLING_LIVE && plan !== "free");
}

/** The retired Founder plan folds into Pro, so nobody loses what they had. */
export function normalizePlan(raw: unknown): PlanId | null {
  if (raw === "founder") return "pro";
  return PLAN_IDS.includes(raw as PlanId) ? (raw as PlanId) : null;
}
