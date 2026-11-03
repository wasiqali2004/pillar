import "server-only";
import { defineWidget } from "../types";
import { PortfolioTile } from "./PortfolioTile";
import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import {
  candidatesFor,
  closeAt,
  fxSymbol,
  getHistories,
  getIntraday,
  getQuotes,
  type Close,
} from "@/lib/portfolio/market";
import { PERIODS, type PeriodKey } from "./periods";

export { PERIODS, type PeriodKey } from "./periods";

export type Change = { cents: number; pct: number | null };

export type PositionRow = {
  symbol: string;
  label: string | null;
  shares: number;
  /** All amounts below are CAD cents, converted at today's rate. */
  costBasisCents: number;
  valueCents: number | null;
  gainCents: number | null;
  gainPct: number | null;
  /** Currency the security trades in — shown as a tag when it isn't CAD. */
  nativeCurrency: string | null;
  source: "manual" | "plaid";
  /** Set when the value came from a statement, not a feed — see holdings.valuedOn. */
  valuedOn: string | null;
  /** Null for a period this position has no price history for. */
  changes: Record<PeriodKey, Change | null>;
};

export type SeriesPoint = { t: number; v: number };

export type PeriodSummary = {
  key: PeriodKey;
  /** Net change in CAD cents over the period — gains minus losses. */
  netCents: number;
  netPct: number;
  /** Sum of every position that went up, and of every one that went down. */
  gainsCents: number;
  lossesCents: number;
  up: number;
  down: number;
  /** Portfolio value through the period, oldest first, in CAD cents —
      intraday for 1D, daily closes for 1W–1Y, empty for ALL. */
  series: SeriesPoint[];
};

export type PortfolioData = {
  rows: PositionRow[];
  periods: PeriodSummary[];
  totalValueCents: number;
  totalCostCents: number;
  /** Positions with no price at all — left out of every figure. */
  unpriced: number;
  /** True when prices came from cache because the feed failed or is throttled. */
  stale: boolean;
  fetchedAt: string | null;
  error: string | null;
  /** True once at least one brokerage is linked at /connect-money. */
};

type Position = {
  symbol: string;
  label: string | null;
  shares: number;
  costBasisCents: number;
  /**
   * Manual entries are CAD by convention. Wealthsimple's cost basis comes
   * through Plaid tagged "CAD" but is in the security's own currency — six
   * NVDA at $660 total is ~$110/share, NVDA's USD price when bought, not its
   * CAD price — so it's converted like the market value is.
   */
  costIn: "cad" | "native";
  candidates: string[];
  source: "manual" | "plaid";
  manualValueCents: number | null;
  valuedOn: string | null;
};

async function loadPositions(): Promise<Position[]> {
  const manual = await db.select().from(holdings).orderBy(holdings.sortOrder);

  return [
    ...manual.map((p) => ({
      symbol: p.symbol,
      label: p.label,
      shares: p.shares,
      costBasisCents: p.costBasisCents,
      costIn: "cad" as const,
      // A fund code like 5017 is not a ticker; looking it up risks matching
      // some unrelated security, so a manually valued row asks for no quote.
      candidates: p.manualValueCents == null ? candidatesFor(p.symbol) : [],
      source: "manual" as const,
      manualValueCents: p.manualValueCents,
      valuedOn: p.valuedOn,
    })),
  ];
}

/** Start of each lookback period, as a timestamp. 1D and ALL don't use one. */
function periodStart(key: PeriodKey, now: Date): number | null {
  const d = new Date(now);
  switch (key) {
    case "1W":
      return now.getTime() - 7 * 86_400_000;
    case "1M":
      d.setMonth(d.getMonth() - 1);
      return d.getTime();
    case "6M":
      d.setMonth(d.getMonth() - 6);
      return d.getTime();
    case "1Y":
      d.setFullYear(d.getFullYear() - 1);
      return d.getTime();
    default:
      return null;
  }
}

export async function loadPortfolio(): Promise<PortfolioData> {
  const positions = await loadPositions();

  const empty = {
    rows: [],
    periods: [],
    totalValueCents: 0,
    totalCostCents: 0,
    unpriced: 0,
    stale: false,
    fetchedAt: null,
    error: null,
  };
  if (positions.length === 0) return empty;

  // Round one: every candidate ticker, to learn which ones Yahoo knows and
  // what currency each trades in.
  const first = await getQuotes(positions.flatMap((p) => p.candidates));
  const resolved = positions.map((p) =>
    p.candidates.map((c) => first.quotes.get(c)).find((q) => q != null) ?? null,
  );

  // Round two: the FX rates those currencies need.
  const fxPairs = [
    ...new Set(
      resolved.map((q) => fxSymbol(q?.currency ?? null)).filter((s): s is string => !!s),
    ),
  ];
  const fx = await getQuotes(fxPairs);

  const priced = resolved.filter((q) => q != null).map((q) => q.symbol);
  const [histories, intraday] = await Promise.all([
    getHistories([...priced, ...fxPairs]),
    getIntraday(priced),
  ]);

  const now = new Date();
  const starts = Object.fromEntries(
    PERIODS.map((p) => [p.key, periodStart(p.key, now)]),
  ) as Record<PeriodKey, number | null>;

  /** CAD per unit of `currency`, now / yesterday / at a past time. */
  const rateNow = (cur: string | null) => {
    const pair = fxSymbol(cur);
    if (!pair) return 1;
    const q = fx.quotes.get(pair);
    return q ? q.priceCents / 100 : null;
  };
  const ratePrev = (cur: string | null) => {
    const pair = fxSymbol(cur);
    if (!pair) return 1;
    const q = fx.quotes.get(pair);
    return q?.prevCloseCents != null ? q.prevCloseCents / 100 : rateNow(cur);
  };
  const rateAt = (cur: string | null, t: number) => {
    const pair = fxSymbol(cur);
    if (!pair) return 1;
    const h = histories.get(pair);
    return (h && closeAt(h, t)) ?? rateNow(cur);
  };

  type Working = {
    row: PositionRow;
    history: Close[] | null;
    currency: string | null;
    /** The ticker Yahoo priced it under, e.g. VFV.TO for Wealthsimple's VFV. */
    yahoo: string | null;
  };
  const working: Working[] = [];
  let unpriced = 0;

  positions.forEach((p, i) => {
    const q = resolved[i];
    const fxNow = rateNow(q?.currency ?? null);
    const noChanges = Object.fromEntries(PERIODS.map((x) => [x.key, null])) as Record<
      PeriodKey,
      Change | null
    >;

    // Valued from a statement: real value, real cost, real all-time gain — but
    // no history, so it takes no part in the 1D–1Y figures rather than
    // pretending to have been flat.
    if (p.manualValueCents != null) {
      const gainCents = p.manualValueCents - p.costBasisCents;
      working.push({
        row: {
          symbol: p.symbol,
          label: p.label,
          shares: p.shares,
          costBasisCents: p.costBasisCents,
          valueCents: p.manualValueCents,
          gainCents,
          gainPct:
            p.costBasisCents === 0 ? null : (gainCents / p.costBasisCents) * 100,
          nativeCurrency: null,
          source: p.source,
          valuedOn: p.valuedOn,
          changes: {
            ...noChanges,
            ALL: {
              cents: gainCents,
              pct:
                p.costBasisCents === 0
                  ? null
                  : (gainCents / p.costBasisCents) * 100,
            },
          },
        },
        history: null,
        currency: null,
        yahoo: null,
      });
      return;
    }

    if (!q || fxNow == null) {
      unpriced++;
      working.push({
        row: {
          symbol: p.symbol,
          label: p.label,
          shares: p.shares,
          costBasisCents: p.costBasisCents,
          valueCents: null,
          gainCents: null,
          gainPct: null,
          nativeCurrency: null,
          source: p.source,
          valuedOn: null,
          changes: noChanges,
        },
        history: null,
        currency: null,
        yahoo: null,
      });
      return;
    }

    const valueCents = Math.round(p.shares * q.priceCents * fxNow);
    const costBasisCents = Math.round(
      p.costIn === "native" ? p.costBasisCents * fxNow : p.costBasisCents,
    );
    const gainCents = valueCents - costBasisCents;
    const history = histories.get(q.symbol) ?? null;

    const changes = { ...noChanges };
    const setFrom = (key: PeriodKey, baseCents: number | null) => {
      if (baseCents == null) return;
      const cents = valueCents - Math.round(baseCents);
      changes[key] = { cents, pct: baseCents === 0 ? null : (cents / baseCents) * 100 };
    };

    const prevFx = ratePrev(q.currency);
    setFrom(
      "1D",
      q.prevCloseCents == null || prevFx == null
        ? null
        : p.shares * q.prevCloseCents * prevFx,
    );
    for (const key of ["1W", "1M", "6M", "1Y"] as const) {
      const t = starts[key]!;
      const close = history ? closeAt(history, t) : null;
      const r = rateAt(q.currency, t);
      setFrom(key, close == null || r == null ? null : p.shares * close * 100 * r);
    }
    changes.ALL = {
      cents: gainCents,
      pct: costBasisCents === 0 ? null : (gainCents / costBasisCents) * 100,
    };

    working.push({
      row: {
        symbol: p.symbol,
        label: p.label,
        shares: p.shares,
        costBasisCents,
        valueCents,
        gainCents,
        gainPct: changes.ALL.pct,
        nativeCurrency: q.currency,
        source: p.source,
        valuedOn: null,
        changes,
      },
      history,
      currency: q.currency,
      yahoo: q.symbol,
    });
  });

  const pricedRows = working.filter((w) => w.row.valueCents != null);
  const totalValueCents = pricedRows.reduce((n, w) => n + w.row.valueCents!, 0);
  const totalCostCents = pricedRows.reduce((n, w) => n + w.row.costBasisCents, 0);

  const periods: PeriodSummary[] = PERIODS.map(({ key }) => {
    let net = 0;
    let base = 0;
    let gains = 0;
    let losses = 0;
    let up = 0;
    let down = 0;
    for (const w of pricedRows) {
      const c = w.row.changes[key];
      if (!c) continue;
      net += c.cents;
      base += key === "ALL" ? w.row.costBasisCents : w.row.valueCents! - c.cents;
      if (c.cents > 0) {
        gains += c.cents;
        up++;
      } else if (c.cents < 0) {
        losses += c.cents;
        down++;
      }
    }

    // Value through the period, rebuilt from daily closes at today's share
    // counts. Only positions with history take part, so the line and the
    // net figure above describe the same set.
    const series: SeriesPoint[] = [];
    const t0 = starts[key];
    if (key === "1D") {
      series.push(...intradaySeries(pricedRows, intraday, ratePrev, rateNow));
    } else if (t0 != null) {
      const withHistory = pricedRows.filter((w) => w.history && w.row.changes[key]);
      const times = [
        ...new Set(
          withHistory.flatMap((w) => w.history!.filter((c) => c.t >= t0).map((c) => c.t)),
        ),
      ].sort((a, b) => a - b);
      for (const t of [t0, ...times]) {
        let v = 0;
        for (const w of withHistory) {
          const close = closeAt(w.history!, t);
          const r = rateAt(w.currency, t);
          if (close != null && r != null) v += w.row.shares * close * 100 * r;
        }
        series.push({ t, v: Math.round(v) });
      }
      series.push({
        t: now.getTime(),
        v: withHistory.reduce((n, w) => n + w.row.valueCents!, 0),
      });
    }

    return {
      key,
      netCents: net,
      netPct: base === 0 ? 0 : (net / base) * 100,
      gainsCents: gains,
      lossesCents: losses,
      up,
      down,
      series,
    };
  });

  const quoteTimes = [...first.quotes.values()].map((q) => Date.parse(q.fetchedAt));

  return {
    // Biggest positions first — the ones that move the totals.
    rows: working
      .map((w) => w.row)
      .sort((a, b) => (b.valueCents ?? -1) - (a.valueCents ?? -1)),
    periods,
    totalValueCents,
    totalCostCents,
    unpriced,
    stale: first.stale || fx.stale,
    fetchedAt: quoteTimes.length ? new Date(Math.max(...quoteTimes)).toISOString() : null,
    error: first.error ?? fx.error,
  };
}

export async function portfolioSummary() {
  const d = await loadPortfolio();
  const round = (n: number | null) => (n == null ? null : Number(n.toFixed(2)));
  return {
    total_value_cents: d.totalValueCents,
    total_cost_cents: d.totalCostCents,
    prices_stale: d.stale,
    unpriced_positions: d.unpriced,
    periods: d.periods.map((p) => ({
      period: p.key,
      net_cents: p.netCents,
      net_pct: round(p.netPct),
      gains_cents: p.gainsCents,
      losses_cents: p.lossesCents,
      positions_up: p.up,
      positions_down: p.down,
    })),
    positions: d.rows.map((r) => ({
      symbol: r.symbol,
      shares: r.shares,
      value_cents: r.valueCents,
      /** Set when the value is a statement figure of that date, not a live quote. */
      valued_from_statement_on: r.valuedOn,
      gain_pct: round(r.gainPct),
      change_pct: Object.fromEntries(
        Object.entries(r.changes).map(([k, c]) => [k, round(c?.pct ?? null)]),
      ),
    })),
  };
}

export const portfolioWidget = defineWidget<PortfolioData>({
  id: "portfolio",
  title: "Portfolio",
  size: "sm",
  span: 12,
  refresh: "live",
  load: loadPortfolio,
  Tile: PortfolioTile,
  tools: [
    {
      name: "get_portfolio",
      description:
        "Stock, ETF and crypto positions with live prices, in CAD: total value and cost, plus net change, total gains and total losses over 1D, 1W, 1M, 6M, 1Y and ALL (all time = vs cost basis). 1W–1Y are rebuilt from daily closes at today's share counts, so a position bought mid-period is counted as if held all period. Includes brokerage holdings synced via Plaid (Wealthsimple, EQ Bank) alongside manually entered ones. A position with valued_from_statement_on set is a segregated fund or insurance contract valued from a statement of that date, not a live quote: it counts toward total value and all-time gain, but has no 1D-1Y change. Amounts in cents.",
      input_schema: { type: "object", properties: {} },
      handler: portfolioSummary,
    },
  ],
});

const nyDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Portfolio value through the most recent trading session, in 5-minute steps.
 * Starts from yesterday's close (the same base the 1D net uses) and ends on
 * the current value, so the line and the headline number agree. Crypto
 * trades around the clock and simply rides along inside the stock session.
 */
function intradaySeries(
  rows: { row: PositionRow; currency: string | null; yahoo: string | null }[],
  intraday: Map<string, Close[]>,
  prevRate: (cur: string | null) => number | null,
  rateNow: (cur: string | null) => number | null,
): SeriesPoint[] {
  const withData = rows
    .map((w) => ({ w, pts: (w.yahoo && intraday.get(w.yahoo)) || null }))
    .filter((x): x is { w: (typeof rows)[number]; pts: Close[] } => !!x.pts?.length);
  if (withData.length === 0) return [];

  // The session = the latest New York trading date any stock has points for.
  const equities = withData.filter((x) => !/-|=/.test(x.w.yahoo!));
  if (equities.length === 0) return [];
  const latest = Math.max(...equities.map((x) => x.pts.at(-1)!.t));
  const session = nyDate.format(new Date(latest));
  const times = [
    ...new Set(
      withData.flatMap((x) =>
        x.pts.filter((p) => nyDate.format(new Date(p.t)) === session).map((p) => p.t),
      ),
    ),
  ].sort((a, b) => a - b);
  if (times.length < 2) return [];

  const base = withData.reduce((n, { w }) => {
    const c = w.row.changes["1D"];
    return c ? n + (w.row.valueCents! - c.cents) : n;
  }, 0);

  const out: SeriesPoint[] = [{ t: times[0] - 5 * 60_000, v: Math.round(base) }];
  for (const t of times) {
    let v = 0;
    for (const { w, pts } of withData) {
      if (!w.row.changes["1D"]) continue;
      const close = closeAt(pts, t);
      const r = rateNow(w.currency) ?? prevRate(w.currency);
      if (close != null && r != null) v += w.row.shares * close * 100 * r;
    }
    out.push({ t, v: Math.round(v) });
  }
  out.push({
    t: Date.now(),
    v: withData.reduce((n, { w }) => (w.row.changes["1D"] ? n + w.row.valueCents! : n), 0),
  });
  return out;
}
