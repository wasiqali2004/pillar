import "server-only";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import webpush from "web-push";
import { contactEmail, hostedUrl } from "@/lib/auth/hosting";
import { dataDir } from "@/lib/auth/paths";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { normalizePrefs, type ReminderPrefs } from "./schedule";

/**
 * Browser push. The message is encrypted for that one device before it leaves,
 * so Google, Apple or Mozilla carry it without being able to read it.
 */

const SUBS = "push.subscriptions";
const PREFS = "reminders.prefs";
const SENT = "reminders.sent";

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushMessage = { title: string; body: string; tag?: string; url?: string };

type Vapid = { publicKey: string; privateKey: string };
let cachedVapid: Vapid | null = null;

/** Made once and kept on the disk: changing it would silently end every subscription. */
function vapid(): Vapid {
  if (cachedVapid) return cachedVapid;
  const file = join(dataDir(), ".vapid.json");
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(webpush.generateVAPIDKeys()), { mode: 0o600 });
  cachedVapid = JSON.parse(readFileSync(file, "utf8")) as Vapid;
  return cachedVapid;
}

export function vapidPublicKey() {
  return vapid().publicKey;
}

const PUSH_HOSTS = /^(fcm\.googleapis\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)$/;

/**
 * The server POSTs to whatever address a subscription names, and the browser
 * supplies it. Only real push services are accepted, or an account could point
 * this server at its own private network.
 */
export function isPushEndpoint(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && PUSH_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

export function parseSubscription(v: unknown): PushSub | null {
  const s = v as Partial<PushSub> | null;
  if (typeof s?.endpoint !== "string" || !isPushEndpoint(s.endpoint)) return null;
  if (typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string") return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } };
}

async function read(key: string): Promise<unknown> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value;
}

async function store(key: string, value: unknown) {
  const updatedAt = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt } });
}

export async function getSubscriptions(): Promise<PushSub[]> {
  const v = await read(SUBS);
  return Array.isArray(v) ? (v as PushSub[]) : [];
}

/** Newest first, and a person only has so many devices. */
export async function saveSubscription(sub: PushSub) {
  const others = (await getSubscriptions()).filter((s) => s.endpoint !== sub.endpoint);
  await store(SUBS, [sub, ...others].slice(0, 10));
}

export async function removeSubscription(endpoint: string) {
  await store(SUBS, (await getSubscriptions()).filter((s) => s.endpoint !== endpoint));
}

export async function getPrefs(): Promise<ReminderPrefs> {
  return normalizePrefs(await read(PREFS));
}

export async function savePrefs(input: unknown) {
  const prefs = normalizePrefs(input);
  await store(PREFS, prefs);
  return prefs;
}

export async function getSent(): Promise<string[]> {
  const v = await read(SENT);
  return Array.isArray(v) ? (v as string[]) : [];
}

export async function saveSent(keys: string[]) {
  await store(SENT, keys.slice(-30));
}

/** Sends to each of this user's devices. A device the service says is gone gets dropped. */
export async function sendPush(message: PushMessage): Promise<number> {
  const keys = vapid();
  const details = {
    subject: contactEmail() ? `mailto:${contactEmail()}` : (hostedUrl() ?? "mailto:hello@example.com"),
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  };
  let delivered = 0;
  for (const sub of await getSubscriptions()) {
    if (!isPushEndpoint(sub.endpoint)) continue;
    try {
      await webpush.sendNotification(sub, JSON.stringify(message), { TTL: 600, vapidDetails: details });
      delivered += 1;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await removeSubscription(sub.endpoint);
      else console.error(`[pillar] push failed: ${status ?? (e instanceof Error ? e.message : e)}`);
    }
  }
  return delivered;
}
