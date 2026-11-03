import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq, like } from "drizzle-orm";
import { dataDir } from "@/lib/auth/paths";
import { db } from "@/lib/db";
import { appSettings, auditLog } from "@/lib/db/schema";

/**
 * The keys a user pastes in to connect their own apps. Encrypted with
 * AES-256-GCM before they touch the database, and never sent back to the
 * browser: the UI only ever learns a provider's label and when it connected.
 */

export type Credentials = {
  hevy: { apiKey: string };
  shopify: { domain: string; token?: string; clientId?: string; clientSecret?: string };
  square: { token: string };
  stripe: { key: string };
};
export type Provider = keyof Credentials;
export const PROVIDERS: Provider[] = ["hevy", "shopify", "square", "stripe"];

export type ConnectionInfo = { provider: Provider; label: string; connectedAt: string };

type Stored = { label: string; connectedAt: string; blob: string };

const PREFIX = "connection:";

let cachedKey: Buffer | null = null;

/**
 * PILLAR_SECRET wins when set (a deployed server sets it). Otherwise a
 * random key is created once in `.connections-key` in the data folder, so
 * a local install works with no setup. Losing that file means reconnecting.
 */
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.PILLAR_SECRET;
  if (secret) {
    cachedKey = createHash("sha256").update(secret).digest();
    return cachedKey;
  }
  const file = join(dataDir(), ".connections-key");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600 });
  cachedKey = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
  return cachedKey;
}

function seal(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}

function open(blob: string): unknown {
  const raw = Buffer.from(blob, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8"));
}

/**
 * For tokens that live in their own table rather than here (Google, Plaid).
 * Values saved before encryption was added have no prefix and read back as-is,
 * then get sealed the next time they're written.
 */
const SEALED = "enc:";
export function sealSecret(value: string): string {
  return SEALED + seal(value);
}
export function openSecret(stored: string): string {
  return stored.startsWith(SEALED) ? String(open(stored.slice(SEALED.length))) : stored;
}

export async function getCredentials<P extends Provider>(provider: P): Promise<Credentials[P] | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, PREFIX + provider)).limit(1);
  if (!row) return null;
  try {
    return open((row.value as Stored).blob) as Credentials[P];
  } catch {
    // Wrong or missing key file: treat as not connected rather than crash the page.
    return null;
  }
}

export async function saveCredentials<P extends Provider>(provider: P, creds: Credentials[P], label: string) {
  const value: Stored = { label, connectedAt: new Date().toISOString(), blob: seal(creds) };
  const updatedAt = new Date().toISOString();
  await db
    .insert(appSettings)
    .values({ key: PREFIX + provider, value, updatedAt })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt } });
  await db.insert(auditLog).values({
    actor: "user",
    action: "connection.add",
    tableName: "app_settings",
    payload: { provider, label },
  });
}

export async function removeCredentials(provider: Provider) {
  await db.delete(appSettings).where(eq(appSettings.key, PREFIX + provider));
  await db.insert(auditLog).values({
    actor: "user",
    action: "connection.remove",
    tableName: "app_settings",
    payload: { provider },
  });
}

export async function listConnections(): Promise<ConnectionInfo[]> {
  const rows = await db.select().from(appSettings).where(like(appSettings.key, `${PREFIX}%`));
  return rows.map((r) => {
    const v = r.value as Stored;
    return { provider: r.key.slice(PREFIX.length) as Provider, label: v.label, connectedAt: v.connectedAt };
  });
}
