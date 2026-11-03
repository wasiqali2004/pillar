import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import { authDbPath, fileUrl } from "./paths";
import { hashToken, newToken } from "./password";

/**
 * Accounts and sessions. Deliberately separate from the per-user databases: it
 * holds only who can sign in, so nothing about anyone's prayers, health or
 * money is ever in the same file as anyone else's.
 */

export type User = {
  id: string;
  email: string;
  name: string | null;
  timezone: string | null;
  isOwner: boolean;
  emailVerified: boolean;
  createdAt: string;
};

const SESSION_DAYS = 60;

const g = globalThis as unknown as { __pillarAuth?: { client: Client; ready: Promise<void> } };

function auth() {
  if (!g.__pillarAuth) {
    const client = createClient({ url: fileUrl(authDbPath()) });
    const ready = client
      .batch(
        [
          `CREATE TABLE IF NOT EXISTS users (
             id TEXT PRIMARY KEY,
             email TEXT NOT NULL UNIQUE COLLATE NOCASE,
             name TEXT,
             password_hash TEXT NOT NULL,
             timezone TEXT,
             is_owner INTEGER NOT NULL DEFAULT 0,
             created_at TEXT NOT NULL,
             last_seen_at TEXT
           )`,
          `CREATE TABLE IF NOT EXISTS sessions (
             token_hash TEXT PRIMARY KEY,
             user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
             created_at TEXT NOT NULL,
             expires_at TEXT NOT NULL
           )`,
          `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`,
          `CREATE TABLE IF NOT EXISTS reset_tokens (
             token_hash TEXT PRIMARY KEY,
             user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
             expires_at TEXT NOT NULL
           )`,
          `CREATE TABLE IF NOT EXISTS verify_tokens (
             token_hash TEXT PRIMARY KEY,
             user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
             expires_at TEXT NOT NULL
           )`,
          `CREATE TABLE IF NOT EXISTS waitlist (
             email TEXT PRIMARY KEY COLLATE NOCASE,
             created_at TEXT NOT NULL
           )`,
        ],
        "write",
      )
      .then(async () => {
        const cols = await client.execute("PRAGMA table_info(users)");
        if (!cols.rows.some((c) => c.name === "email_verified_at")) {
          await client.execute("ALTER TABLE users ADD COLUMN email_verified_at TEXT");
        }
      });
    g.__pillarAuth = { client, ready };
  }
  return g.__pillarAuth;
}

async function run(sql: string, args: (string | number | null)[] = []) {
  const a = auth();
  await a.ready;
  return a.client.execute({ sql, args });
}

function toUser(r: Record<string, unknown>): User {
  return {
    id: String(r.id),
    email: String(r.email),
    name: r.name == null ? null : String(r.name),
    timezone: r.timezone == null ? null : String(r.timezone),
    isOwner: Number(r.is_owner) === 1,
    emailVerified: r.email_verified_at != null,
    createdAt: String(r.created_at),
  };
}

export async function countUsers() {
  const r = await run("SELECT count(*) AS n FROM users");
  return Number(r.rows[0].n);
}

export async function findUserByEmail(email: string) {
  const r = await run("SELECT * FROM users WHERE email = ?", [email.trim()]);
  const row = r.rows[0] as unknown as Record<string, unknown> | undefined;
  return row ? { user: toUser(row), passwordHash: String(row.password_hash) } : null;
}

export async function getUser(id: string) {
  const r = await run("SELECT * FROM users WHERE id = ?", [id]);
  const row = r.rows[0] as unknown as Record<string, unknown> | undefined;
  return row ? { user: toUser(row), passwordHash: String(row.password_hash) } : null;
}

export async function createUser(input: {
  email: string;
  name: string | null;
  passwordHash: string;
  timezone: string | null;
  isOwner: boolean;
}): Promise<User> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await run(
    `INSERT INTO users (id, email, name, password_hash, timezone, is_owner, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.email.trim(), input.name, input.passwordHash, input.timezone, input.isOwner ? 1 : 0, createdAt, createdAt],
  );
  return { id, email: input.email.trim(), name: input.name, timezone: input.timezone, isOwner: input.isOwner, emailVerified: false, createdAt };
}

export async function createSession(userId: string) {
  const token = newToken();
  const now = Date.now();
  await run("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
    hashToken(token),
    userId,
    new Date(now).toISOString(),
    new Date(now + SESSION_DAYS * 86_400_000).toISOString(),
  ]);
  return { token, maxAge: SESSION_DAYS * 86_400 };
}

export async function userForToken(token: string): Promise<User | null> {
  const r = await run(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    [hashToken(token), new Date().toISOString()],
  );
  const row = r.rows[0] as unknown as Record<string, unknown> | undefined;
  return row ? toUser(row) : null;
}

export async function deleteSession(token: string) {
  await run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
}

export async function deleteSessionsFor(userId: string, exceptToken?: string) {
  if (exceptToken) {
    await run("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", [userId, hashToken(exceptToken)]);
  } else {
    await run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  }
}

export async function setPasswordHash(userId: string, hash: string) {
  await run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId]);
}

export async function setUserName(userId: string, name: string | null) {
  await run("UPDATE users SET name = ? WHERE id = ?", [name, userId]);
}

export async function setUserTimezone(userId: string, timezone: string) {
  await run("UPDATE users SET timezone = ? WHERE id = ?", [timezone, userId]);
}

export async function touchUser(userId: string) {
  await run("UPDATE users SET last_seen_at = ? WHERE id = ?", [new Date().toISOString(), userId]);
}

/** Who the background sync works for: anyone seen in the last month. */
export async function activeUsers(withinDays = 30): Promise<User[]> {
  const since = new Date(Date.now() - withinDays * 86_400_000).toISOString();
  const r = await run("SELECT * FROM users WHERE last_seen_at >= ?", [since]);
  return r.rows.map((row) => toUser(row as unknown as Record<string, unknown>));
}

export async function allUsers(): Promise<User[]> {
  const r = await run("SELECT * FROM users");
  return r.rows.map((row) => toUser(row as unknown as Record<string, unknown>));
}

/** Sessions and reset links that can no longer be used. */
export async function purgeExpired() {
  const now = new Date().toISOString();
  await run("DELETE FROM sessions WHERE expires_at <= ?", [now]);
  await run("DELETE FROM reset_tokens WHERE expires_at <= ?", [now]);
  await run("DELETE FROM verify_tokens WHERE expires_at <= ?", [now]);
}

export async function deleteUserRow(userId: string) {
  await run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  await run("DELETE FROM reset_tokens WHERE user_id = ?", [userId]);
  await run("DELETE FROM verify_tokens WHERE user_id = ?", [userId]);
  await run("DELETE FROM users WHERE id = ?", [userId]);
}

export async function createVerifyToken(userId: string) {
  const token = newToken();
  await run("DELETE FROM verify_tokens WHERE user_id = ?", [userId]);
  await run("INSERT INTO verify_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    hashToken(token),
    userId,
    new Date(Date.now() + 7 * 86_400_000).toISOString(),
  ]);
  return token;
}

export async function consumeVerifyToken(token: string): Promise<string | null> {
  const hash = hashToken(token);
  const r = await run("SELECT user_id FROM verify_tokens WHERE token_hash = ? AND expires_at > ?", [
    hash,
    new Date().toISOString(),
  ]);
  const userId = r.rows[0]?.user_id;
  if (userId == null) return null;
  await run("DELETE FROM verify_tokens WHERE token_hash = ?", [hash]);
  await markEmailVerified(String(userId));
  return String(userId);
}

export async function markEmailVerified(userId: string) {
  await run("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", [new Date().toISOString(), userId]);
}

export async function joinWaitlist(email: string) {
  await run("INSERT INTO waitlist (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING", [email.trim(), new Date().toISOString()]);
}

export async function leaveWaitlist(email: string) {
  await run("DELETE FROM waitlist WHERE email = ?", [email.trim()]);
}

export async function listWaitlist(): Promise<{ email: string; createdAt: string }[]> {
  const r = await run("SELECT email, created_at FROM waitlist ORDER BY created_at DESC");
  return r.rows.map((row) => ({ email: String(row.email), createdAt: String(row.created_at) }));
}

export async function createResetToken(userId: string) {
  const token = newToken();
  await run("DELETE FROM reset_tokens WHERE user_id = ?", [userId]);
  await run("INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    hashToken(token),
    userId,
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  ]);
  return token;
}

/** Single use: a reset link stops working the moment it has been redeemed. */
export async function consumeResetToken(token: string): Promise<string | null> {
  const hash = hashToken(token);
  const r = await run("SELECT user_id FROM reset_tokens WHERE token_hash = ? AND expires_at > ?", [
    hash,
    new Date().toISOString(),
  ]);
  const userId = r.rows[0]?.user_id;
  if (userId == null) return null;
  await run("DELETE FROM reset_tokens WHERE token_hash = ?", [hash]);
  return String(userId);
}
