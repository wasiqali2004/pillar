import "server-only";
import YahooFinance from "yahoo-finance2";
import { db } from "@/lib/db";
import { priceCache } from "@/lib/db/schema";

/**
 * Yahoo Finance access for the Portfolio tile: live quotes (cached in
 * `price_cache` so a dead feed still renders) and daily close history
 * (cached in memory — it only feeds the 1W–1Y period figures, and losing it
 * on a restart costs one refetch, not correctness).
 */

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/** Refetch quotes at most this often; otherwise the cached price is served. */
const QUOTE_STALE_MS = 15 * 60 * 1000;
/** Daily closes only move once a day — an hour is plenty. */
const HISTORY_STALE_MS = 60 * 60 * 1000;
/** A year plus slack, so the 1Y lookback always lands on a real close. */
const HISTORY_DAYS = 380;

export type Quote = {
  symbol: string;
  priceCents: number;
  /** Yesterday's close, derived from the day change Yahoo reports. */
  prevCloseCents: number | null;
  currency: string | null;
  fetchedAt: string;
};

export type Close = { t: number; close: number };

type HistoryEntry = { fetchedAt: number; closes: Close[] };

/**
 * Brokerage tickers aren't Yahoo tickers: Wealthsimple reports "VFV" for the
 * TSX-listed VFV.TO, and crypto as a bare "XRP". Candidates are tried in
 * order and the first one Yahoo actually prices wins.
 */
export function candidatesFor(symbol: string, opts: { crypto?: boolean } = {}) {
  if (opts.crypto) return [`${symbol}-CAD`];
  if (/[.\-=]/.test(symbol)) return [symbol];
  return [symbol, `${symbol}.TO`];
}

/** The FX pair that converts `currency` into CAD, or null for CAD itself. */
export function fxSymbol(currency: string | null): string | null {
  if (!currency || currency === "CAD") return null;
  return `${currency}CAD=X`;
}

// On globalThis so dev-mode HMR doesn't throw these caches away on every edit.
const g = globalThis as unknown as {
  __pillarQuoteAttempts?: Map<string, number>;
  __pillarHistory?: Map<string, HistoryEntry>;
  __pillarIntraday?: Map<string, HistoryEntry>;
  __pillarForceUntil?: number;
  __pillarSharedQuotes?: Map<string, typeof priceCache.$inferSelect>;
};
const lastAttempt = (g.__pillarQuoteAttempts ??= new Map());
/**
 * Every quote fetched, for any account. Prices are public, but each account's
 * price_cache lives in its own database while `lastAttempt` is per server, so
 * without this a symbol one person had just fetched was skipped for the next
 * person too, and their new holding showed as unpriced ($0) for 15 minutes.
 */
const sharedQuotes = (g.__pillarSharedQuotes ??= new Map());

/**
 * Makes the next quote fetch ignore the cache — what "Refresh" presses.
 *
 * A window rather than a one-shot flag on purpose: one loadPortfolio() calls
 * getQuotes twice (securities, then the FX pairs those securities need), so a
 * flag cleared by the first call would leave the second serving stale rates
 * against fresh prices. The in-memory history maps are dropped outright,
 * since their own staleness check is what would otherwise hold them.
 */
export function expireQuoteCache(): void {
  g.__pillarForceUntil = Date.now() + 60_000;
  lastAttempt.clear();
  g.__pillarHistory?.clear();
  g.__pillarIntraday?.clear();
}

/** A symbol just added should be looked up now, not after the throttle window. */
export function forgetQuoteAttempts(symbols: string[]): void {
  for (const s of symbols) lastAttempt.delete(s);
}

/** How soon a failed fetch (feed down, throttled) is tried again. */
const RETRY_AFTER_FAILURE_MS = 60 * 1000;

function toQuote(row: typeof priceCache.$inferSelect): Quote {
  return {
    symbol: row.symbol,
    priceCents: row.priceCents,
    prevCloseCents:
      row.changePct == null
        ? null
        : Math.round(row.priceCents / (1 + row.changePct / 100)),
    currency: row.currency,
    fetchedAt: row.fetchedAt,
  };
}

/**
 * Quotes for every symbol asked for, refreshed from Yahoo when any are
 * missing or stale. Never throws: on a feed failure it returns whatever the
 * cache holds, with the error message alongside.
 */
export async function getQuotes(symbols: string[]): Promise<{
  quotes: Map<string, Quote>;
  stale: boolean;
  error: string | null;
}> {
  const wanted = [...new Set(symbols)];
  let cached = await db.select().from(priceCache);
  const byCache = new Map(cached.map((c) => [c.symbol, c]));

  // Fill this account's cache from quotes another account already fetched.
  for (const s of wanted) {
    const shared = sharedQuotes.get(s);
    const mine = byCache.get(s);
    if (shared && (!mine || Date.parse(shared.fetchedAt) > Date.parse(mine.fetchedAt))) {
      await db.insert(priceCache).values(shared).onConflictDoUpdate({ target: priceCache.symbol, set: shared });
      byCache.set(s, shared);
    }
  }
  cached = [...byCache.values()];

  // A candidate Yahoo doesn't know (bare "VFV") never lands in the cache, so
  // "missing" alone would refetch on every render — it waits out the same
  // window as a stale price.
  const forced = Date.now() < (g.__pillarForceUntil ?? 0);
  const needsFetch =
    forced ||
    wanted.some((s) => {
      const c = byCache.get(s);
      if (c) return Date.now() - Date.parse(c.fetchedAt) > QUOTE_STALE_MS;
      return Date.now() - (lastAttempt.get(s) ?? 0) > QUOTE_STALE_MS;
    });

  let error: string | null = null;
  let stale = false;

  if (needsFetch && wanted.length > 0) {
    for (const s of wanted) lastAttempt.set(s, Date.now());
    try {
      // validateResult off: an unknown candidate (e.g. "VFV" on a US
      // exchange) comes back as a priceless stub that fails the schema, and
      // one bad candidate must not sink the whole batch.
      const res = await yf.quote(wanted, {}, { validateResult: false });
      const list = Array.isArray(res) ? res : [res];
      const now = new Date().toISOString();
      for (const q of list) {
        if (!q?.symbol || typeof q.regularMarketPrice !== "number") continue;
        const row = {
          symbol: q.symbol,
          priceCents: Math.round(q.regularMarketPrice * 100),
          changePct:
            typeof q.regularMarketChangePercent === "number"
              ? q.regularMarketChangePercent
              : null,
          currency: q.currency ?? null,
          fetchedAt: now,
        };
        await db
          .insert(priceCache)
          .values(row)
          .onConflictDoUpdate({ target: priceCache.symbol, set: row });
        sharedQuotes.set(row.symbol, row);
      }
      cached = await db.select().from(priceCache);
    } catch (e) {
      // A failure says nothing about whether the symbols exist, so they're
      // retried in a minute rather than waiting out the full window.
      for (const s of wanted) lastAttempt.set(s, Date.now() - QUOTE_STALE_MS + RETRY_AFTER_FAILURE_MS);
      // The tile still renders from cache — a dead feed must not blank the page.
      error = e instanceof Error ? e.message : "Price feed unavailable";
      stale = cached.length > 0;
    }
  }

  const quotes = new Map<string, Quote>();
  for (const c of cached) {
    if (wanted.includes(c.symbol)) quotes.set(c.symbol, toQuote(c));
  }
  return { quotes, stale, error };
}

/* ── daily close history ─────────────────────────────────────── */

const historyCache = (g.__pillarHistory ??= new Map());

async function fetchHistory(symbol: string): Promise<Close[]> {
  const res = await yf.chart(symbol, {
    period1: new Date(Date.now() - HISTORY_DAYS * 86_400_000),
    interval: "1d",
  });
  return (res.quotes ?? [])
    .filter((q) => typeof q.close === "number" && q.date)
    .map((q) => ({ t: new Date(q.date).getTime(), close: q.close as number }))
    .sort((a, b) => a.t - b.t);
}

/**
 * Daily closes for each symbol over the last ~year. A symbol whose fetch
 * fails keeps its previous cached series if there is one, else is left out —
 * its period figures then read "—" rather than a guess.
 */
export async function getHistories(symbols: string[]): Promise<Map<string, Close[]>> {
  const wanted = [...new Set(symbols)];
  const out = new Map<string, Close[]>();
  const todo: string[] = [];

  for (const s of wanted) {
    const hit = historyCache.get(s);
    if (hit && Date.now() - hit.fetchedAt < HISTORY_STALE_MS) out.set(s, hit.closes);
    else todo.push(s);
  }

  // A handful at a time — thirty-odd parallel chart calls gets throttled.
  const CONCURRENCY = 6;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + CONCURRENCY).map(async (s) => {
        try {
          const closes = await fetchHistory(s);
          if (closes.length > 0) {
            historyCache.set(s, { fetchedAt: Date.now(), closes });
            out.set(s, closes);
            return;
          }
        } catch {
          // fall through to the stale copy
        }
        const old = historyCache.get(s);
        if (old) out.set(s, old.closes);
      }),
    );
  }
  return out;
}

/* ── intraday (for the 1D chart) ─────────────────────────────── */

const INTRADAY_STALE_MS = 10 * 60 * 1000;
const intradayCache = (g.__pillarIntraday ??= new Map());

/**
 * 5-minute prices over the last few days, so the 1D chart can draw the most
 * recent session even on a weekend. Same failure rule as getHistories: a
 * symbol that won't fetch keeps its stale copy or drops out.
 */
export async function getIntraday(symbols: string[]): Promise<Map<string, Close[]>> {
  const wanted = [...new Set(symbols)];
  const out = new Map<string, Close[]>();
  const todo: string[] = [];

  for (const s of wanted) {
    const hit = intradayCache.get(s);
    if (hit && Date.now() - hit.fetchedAt < INTRADAY_STALE_MS) out.set(s, hit.closes);
    else todo.push(s);
  }

  const CONCURRENCY = 6;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + CONCURRENCY).map(async (s) => {
        try {
          const res = await yf.chart(s, {
            period1: new Date(Date.now() - 5 * 86_400_000),
            interval: "5m",
          });
          const closes = (res.quotes ?? [])
            .filter((q) => typeof q.close === "number" && q.date)
            .map((q) => ({ t: new Date(q.date).getTime(), close: q.close as number }))
            .sort((a, b) => a.t - b.t);
          if (closes.length > 0) {
            intradayCache.set(s, { fetchedAt: Date.now(), closes });
            out.set(s, closes);
            return;
          }
        } catch {
          // fall through to the stale copy
        }
        const old = intradayCache.get(s);
        if (old) out.set(s, old.closes);
      }),
    );
  }
  return out;
}

/** The last close at or before `t`; the first close if `t` predates them all
    (a position listed mid-period is measured from its first trading day). */
export function closeAt(closes: Close[], t: number): number | null {
  if (closes.length === 0) return null;
  let lo = 0;
  let hi = closes.length - 1;
  if (closes[0].t > t) return closes[0].close;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (closes[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return closes[lo].close;
}
