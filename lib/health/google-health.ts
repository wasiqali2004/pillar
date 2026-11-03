import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  oauthTokens,
  bodyMetrics,
  syncState,
  auditLog,
} from "@/lib/db/schema";
import { localDate, shiftDate } from "@/lib/date";
import { openSecret, sealSecret } from "@/lib/connections/vault";

/**
 * Google Health API — the replacement for the Fitbit Web API, which stops
 * serving data in September 2026. Same watch, different front door: Google
 * OAuth instead of Fitbit's, and health.googleapis.com instead of api.fitbit.com.
 *
 * Pulls sleep, daily steps and total calories burned — read-only, and nothing
 * beyond the two scopes below.
 */

const PROVIDER = "google_health";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://health.googleapis.com/v4";

export const SLEEP_SCOPE =
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly";
/** Steps and calories both live under activity_and_fitness. */
export const ACTIVITY_SCOPE =
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";

/** Sleep is capped at 25 data points per page by the API, unlike other types. */
const PAGE_SIZE = 25;

/** dailyRollUp refuses total-calories ranges longer than 14 days. */
const ROLLUP_CHUNK_DAYS = 14;

/** Refresh a little early; a token that expires mid-request is a failed sync. */
const EXPIRY_BUFFER_MS = 60_000;

/**
 * Don't re-hit Google on every render. Sleep lands once a night, but steps
 * climb all day — 10 minutes keeps the tile close to the watch.
 */
const STALE_AFTER_MS = 10 * 60 * 1000;

type Config = { clientId: string; clientSecret: string; redirectUri: string };

/** Null rather than throwing, so an unconfigured app still renders its tiles. */
export function healthConfig(): Config | null {
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_HEALTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/* ── OAuth ──────────────────────────────────────────────────── */

export function buildAuthUrl(cfg: Config, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: `${SLEEP_SCOPE} ${ACTIVITY_SCOPE}`,
    // Without offline + consent Google returns no refresh token on re-auth,
    // and the connection silently dies the first time the access token lapses.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) {
    // json.error is Google's machine-readable code ("invalid_grant"); the
    // description can echo request values, so only the code is surfaced.
    throw new Error(`Google token exchange failed: ${json.error ?? res.status}`);
  }
  return json;
}

export async function exchangeCode(cfg: Config, code: string) {
  const t = await postToken({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  await saveTokens(t);
}

async function saveTokens(t: TokenResponse) {
  const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString();
  const updatedAt = new Date().toISOString();

  // A refresh-token grant echoes no refresh_token; writing null here would
  // revoke our own ability to refresh again.
  const set: Record<string, string> = {
    accessToken: sealSecret(t.access_token),
    expiresAt,
    updatedAt,
  };
  if (t.refresh_token) {
    set.refreshToken = sealSecret(t.refresh_token);
  } else {
    // A refresh grant returns no new one. Re-seal the saved one anyway, so a
    // token stored before encryption existed doesn't stay readable forever.
    const existing = await loadTokens();
    if (existing?.refreshToken) set.refreshToken = sealSecret(openSecret(existing.refreshToken));
  }
  if (t.scope) set.scope = t.scope;

  await db
    .insert(oauthTokens)
    .values({
      provider: PROVIDER,
      accessToken: sealSecret(t.access_token),
      refreshToken: t.refresh_token ? sealSecret(t.refresh_token) : null,
      expiresAt,
      scope: t.scope ?? null,
      updatedAt,
    })
    .onConflictDoUpdate({ target: oauthTokens.provider, set });
}

async function loadTokens() {
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.provider, PROVIDER));
  return row ?? null;
}

/** A valid access token, refreshed if the stored one is spent. */
async function getAccessToken(cfg: Config): Promise<string> {
  const row = await loadTokens();
  if (!row) throw new Error("Google Health is not connected.");

  if (Date.parse(row.expiresAt) - EXPIRY_BUFFER_MS > Date.now()) {
    return openSecret(row.accessToken);
  }
  if (!row.refreshToken) {
    throw new Error("Google Health session expired — reconnect to continue.");
  }

  const t = await postToken({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: openSecret(row.refreshToken),
    grant_type: "refresh_token",
  });
  await saveTokens(t);
  return t.access_token;
}

/** Tells Google to end the grant, then forgets the tokens. For account deletion. */
export async function revokeGoogleHealth() {
  const row = await loadTokens();
  if (!row) return;
  const token = openSecret(row.refreshToken ?? row.accessToken);
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => {});
  await disconnect();
}

export async function disconnect() {
  await db.delete(oauthTokens).where(eq(oauthTokens.provider, PROVIDER));
}

/* ── reading sleep ──────────────────────────────────────────── */

type SleepDataPoint = {
  sleep?: {
    interval?: { startTime?: string; endTime?: string };
    /** mainSleep separates the night from a nap logged the same day. */
    metadata?: { mainSleep?: boolean };
    /** Durations come back as strings ("417"), not numbers. */
    summary?: {
      minutesAsleep?: string | number;
      minutesInSleepPeriod?: string | number;
    };
  };
};

/** One night as Google reports it, before it is folded into a local date. */
type Night = { date: string; minutes: number; mainSleep: boolean };

async function fetchSleep(
  token: string,
  fromISO: string,
  toISO: string,
): Promise<Night[]> {
  // Sleep is indexed by wake time — start_time and date are rejected outright
  // with INVALID_DATA_POINT_FILTER_DATA_TYPE_MEMBER.
  const filter =
    `sleep.interval.end_time >= "${fromISO}" AND ` +
    `sleep.interval.end_time < "${toISO}"`;

  const nights: Night[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      pageSize: String(PAGE_SIZE),
      filter,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `${API}/users/me/dataTypes/sleep/dataPoints?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Health ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();

    for (const dp of (json.dataPoints ?? []) as SleepDataPoint[]) {
      const end = dp.sleep?.interval?.endTime;
      const raw =
        dp.sleep?.summary?.minutesAsleep ??
        dp.sleep?.summary?.minutesInSleepPeriod;
      if (!end || raw == null) continue;
      const minutes = Number(raw);
      if (!Number.isFinite(minutes)) continue;
      // Attributed by wake time: the 4am rollover already puts a 7am wake on
      // the same day the night belongs to, matching the Fitbit CSV importer.
      nights.push({
        date: localDate(new Date(end)),
        minutes: Math.round(minutes),
        mainSleep: dp.sleep?.metadata?.mainSleep === true,
      });
    }

    pageToken = json.nextPageToken || undefined;
  } while (pageToken);

  return nights;
}
/* ── reading steps and calories ─────────────────────────────── */

type CivilDate = { year: number; month: number; day: number };

type DailyRollup = {
  civilStartTime?: { date?: CivilDate };
  /** int64, so it arrives as a string like durations do. */
  steps?: { countSum?: string | number };
  totalCalories?: { kcalSum?: number | string };
};

/** What one calendar day of activity looks like once it's out of Google's shape. */
type ActivityDay = { steps: number | null; calories: number | null };

function toCivil(isoDate: string): CivilDate {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
}

function fromCivil(d: CivilDate): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.year}-${p(d.month)}-${p(d.day)}`;
}

function finite(raw: string | number | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Daily totals for one data type, `from` inclusive to `to` exclusive.
 *
 * Google buckets by the watch's civil (midnight) day, not the app's 4am day —
 * a daily total has no single instant to shift, so the civil date is used as-is.
 */
async function fetchDailyRollup(
  token: string,
  dataType: "steps" | "total-calories",
  from: string,
  to: string,
): Promise<DailyRollup[]> {
  const res = await fetch(
    `${API}/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        range: { start: { date: toCivil(from) }, end: { date: toCivil(to) } },
        windowSizeDays: 1,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Health ${dataType} ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return (json.rollupDataPoints ?? []) as DailyRollup[];
}

async function fetchActivity(
  token: string,
  from: string,
  to: string,
): Promise<Map<string, ActivityDay>> {
  const days = new Map<string, ActivityDay>();
  const day = (d: string) => {
    let cur = days.get(d);
    if (!cur) days.set(d, (cur = { steps: null, calories: null }));
    return cur;
  };

  // Walked in 14-day windows — the total-calories cap — and steps rides along
  // on the same windows so both land for the same dates.
  for (let start = from; start < to; start = shiftDate(start, ROLLUP_CHUNK_DAYS)) {
    const endCandidate = shiftDate(start, ROLLUP_CHUNK_DAYS);
    const end = endCandidate < to ? endCandidate : to;

    const [steps, calories] = await Promise.all([
      fetchDailyRollup(token, "steps", start, end),
      fetchDailyRollup(token, "total-calories", start, end),
    ]);

    for (const r of steps) {
      const d = r.civilStartTime?.date;
      const n = finite(r.steps?.countSum);
      if (d && n != null) day(fromCivil(d)).steps = n;
    }
    for (const r of calories) {
      const d = r.civilStartTime?.date;
      const n = finite(r.totalCalories?.kcalSum);
      if (d && n != null && n > 0) day(fromCivil(d)).calories = n;
    }
  }

  return days;
}

/* ── sync ───────────────────────────────────────────────────── */

export type SyncResult = {
  nights: number;
  activityDays: number;
  from: string;
  to: string;
};

/**
 * Pulls the last `days` of sleep, steps and calories into body_metrics.
 *
 * sleepScore is deliberately left untouched: the Health API exposes duration
 * and stages but not Fitbit's proprietary 0–100 score, so a sync must not
 * blank out scores an export already filled in.
 */
export async function syncHealth(days = 30): Promise<SyncResult> {
  const cfg = healthConfig();
  if (!cfg) throw new Error("Google Health credentials are not configured.");

  const today = localDate();
  const from = shiftDate(today, -days);
  const tomorrow = shiftDate(today, 1);

  try {
    const token = await getAccessToken(cfg);
    const nights = await syncSleepNights(token, from, tomorrow);

    // A connection made before steps were added only holds the sleep scope.
    // Skip rather than 403 until it's reconnected, so sleep keeps flowing.
    let activityDays = 0;
    if (await hasActivityScope()) {
      activityDays = await syncActivityDays(token, from, tomorrow);
    }

    await recordSync(null);
    if (nights + activityDays > 0) {
      await db.insert(auditLog).values({
        actor: "rafiq",
        action: "health.sync",
        tableName: "body_metrics",
        payload: { nights, activityDays, from, to: today, source: PROVIDER },
      });
    }

    return { nights, activityDays, from, to: today };
  } catch (e) {
    await recordSync(e instanceof Error ? e.message : String(e));
    throw e;
  }
}

async function syncSleepNights(token: string, from: string, to: string) {
  const nights = await fetchSleep(token, `${from}T00:00:00Z`, `${to}T00:00:00Z`);

  // Naps come back as their own records. Google flags the real night with
  // mainSleep; the longest wins only when nothing on that date is flagged.
  const byDate = new Map<string, Night>();
  for (const n of nights) {
    const cur = byDate.get(n.date);
    if (
      !cur ||
      (n.mainSleep !== cur.mainSleep ? n.mainSleep : n.minutes > cur.minutes)
    ) {
      byDate.set(n.date, n);
    }
  }

  for (const [date, night] of byDate) {
    await db
      .insert(bodyMetrics)
      .values({
        localDate: date,
        sleepMinutes: night.minutes,
        source: "health_export",
      })
      .onConflictDoUpdate({
        target: bodyMetrics.localDate,
        // source moves too: once Google's number wins, the row is no longer
        // whatever hand-entered value it started as.
        set: { sleepMinutes: night.minutes, source: "health_export" },
      });
  }

  return byDate.size;
}

async function syncActivityDays(token: string, from: string, to: string) {
  const days = await fetchActivity(token, from, to);
  let written = 0;

  for (const [date, a] of days) {
    // Only the fields Google actually reported, so a day with steps but no
    // calorie total doesn't null out a number that was already there.
    const set: { steps?: number; caloriesBurned?: number } = {};
    if (a.steps != null) set.steps = a.steps;
    if (a.calories != null) set.caloriesBurned = a.calories;
    if (Object.keys(set).length === 0) continue;

    await db
      .insert(bodyMetrics)
      .values({ localDate: date, source: "health_export", ...set })
      .onConflictDoUpdate({
        target: bodyMetrics.localDate,
        set: { ...set, source: "health_export" },
      });
    written++;
  }

  return written;
}

async function hasActivityScope() {
  const row = await loadTokens();
  return row?.scope?.split(/\s+/).includes(ACTIVITY_SCOPE) ?? false;
}

async function recordSync(error: string | null) {
  const row = {
    source: PROVIDER,
    cursor: null,
    lastRunAt: new Date().toISOString(),
    lastError: error?.slice(0, 500) ?? null,
  };
  await db
    .insert(syncState)
    .values(row)
    .onConflictDoUpdate({ target: syncState.source, set: row });
}

/**
 * What the tiles call on render. Throttled, and never throws — a dead feed
 * shows yesterday's numbers rather than an error page.
 */
export async function syncHealthIfStale(): Promise<void> {
  if (!healthConfig()) return;
  if (!(await loadTokens())) return;

  const [state] = await db
    .select()
    .from(syncState)
    .where(eq(syncState.source, PROVIDER));

  if (
    state?.lastRunAt &&
    Date.now() - Date.parse(state.lastRunAt) < STALE_AFTER_MS
  ) {
    return;
  }

  try {
    // A render-time pull only needs the recent edge; the callback backfills.
    await syncHealth(3);
  } catch {
    // recordSync already stored the reason; healthStatus() surfaces it.
  }
}

export type HealthStatus = {
  configured: boolean;
  connected: boolean;
  /** False for a connection made before steps and calories were requested. */
  activityGranted: boolean;
  /** Google stopped accepting the saved login, so the user has to press Connect again. */
  expired: boolean;
  connectedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
};

export async function healthStatus(): Promise<HealthStatus> {
  const configured = healthConfig() != null;
  const [token, [state]] = await Promise.all([
    loadTokens(),
    db.select().from(syncState).where(eq(syncState.source, PROVIDER)),
  ]);

  return {
    configured,
    connected: token != null,
    activityGranted:
      token?.scope?.split(/\s+/).includes(ACTIVITY_SCOPE) ?? false,
    // While the Google project is in Testing mode this happens every seven days.
    expired: token != null && /invalid_grant|session expired/i.test(state?.lastError ?? ""),
    connectedAt: token?.connectedAt ?? null,
    lastRunAt: state?.lastRunAt ?? null,
    lastError: state?.lastError ?? null,
  };
}
