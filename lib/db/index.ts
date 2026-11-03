import "server-only";
import { existsSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createClient, type Client } from "@libsql/client";
import * as schema from "./schema";
import { currentUserId } from "@/lib/auth/context";
import { dataDir, fileUrl, userDbPath } from "@/lib/auth/paths";

/**
 * Every user has their own database file.
 *
 * The whole app queries through the one `db` below, but `db` holds no
 * connection of its own: each query asks who the current user is and runs
 * against that user's file. So there is no WHERE user_id to forget, and a bug
 * in a query can't return another person's prayers, health or money, because
 * their data isn't in the file being read.
 *
 * A file is migrated the first time it's opened after a deploy, so new
 * migrations reach everyone without a separate step.
 */

type Entry = { client: Client; ready: Promise<void> };

const g = globalThis as unknown as { __pillarDbs?: Map<string, Entry> };
const open = (g.__pillarDbs ??= new Map<string, Entry>());

function entryFor(userId: string): Entry {
  let entry = open.get(userId);
  if (!entry) {
    const client = createClient({ url: fileUrl(userDbPath(userId)) });
    const ready = migrate(drizzle(client), { migrationsFolder: join(process.cwd(), "drizzle") });
    entry = { client, ready };
    open.set(userId, entry);
  }
  return entry;
}

export async function clientForUser(userId: string): Promise<Client> {
  const entry = entryFor(userId);
  await entry.ready;
  return entry.client;
}

/** The raw connection for whoever is signed in. For the data export. */
export async function currentClient(): Promise<Client> {
  return clientForUser(await currentUserId());
}

/**
 * Permanently removes a user's data. Only called when deleting an account.
 *
 * The data is destroyed before the file is touched: every table is dropped and
 * VACUUM rewrites the file so nothing is recoverable from free pages. On Windows
 * a just-closed database can stay locked for a moment, so if removing the empty
 * file fails, the scheduler sweeps it up later. Either way no data remains.
 */
export async function destroyUserDb(userId: string) {
  const client = await clientForUser(userId);
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
  for (const row of tables.rows) await client.execute(`DROP TABLE IF EXISTS "${String(row.name)}"`);
  await client.execute("VACUUM");
  client.close();
  open.delete(userId);

  const file = userDbPath(userId);
  for (const f of [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]) {
    try {
      rmSync(f, { force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Empty by now. sweepEmptyDbs removes it once the lock clears.
    }
  }
}

/**
 * Swaps a user's whole database for another file. Only for the owner bringing
 * their data from a home install to a server. The next query reopens it and
 * applies any migrations it's missing.
 */
export async function replaceUserDb(userId: string, incomingPath: string) {
  const entry = open.get(userId);
  if (entry) {
    await entry.ready.catch(() => {});
    entry.client.close();
    open.delete(userId);
  }
  const file = userDbPath(userId);
  for (const f of [`${file}-wal`, `${file}-shm`, `${file}-journal`]) rmSync(f, { force: true });
  renameSync(incomingPath, file);
}

/**
 * Removes emptied database files whose account is gone. The size check is the
 * safety catch: it can only ever remove a file that holds no data, so a damaged
 * accounts database could never turn this into deleting real people's files.
 */
export function sweepEmptyDbs(liveUserIds: Set<string>) {
  const dir = join(dataDir(), "users");
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const id = name.slice(0, -".db".length);
    if (!name.endsWith(".db") || liveUserIds.has(id)) continue;
    const file = join(dir, name);
    try {
      if (statSync(file).size <= 8192) rmSync(file, { force: true });
    } catch {
      // Still locked. Next round.
    }
  }
}

const scoped = {
  execute: async (...args: Parameters<Client["execute"]>) => (await currentClient()).execute(...args),
  batch: async (...args: Parameters<Client["batch"]>) => (await currentClient()).batch(...args),
  migrate: async (...args: Parameters<Client["migrate"]>) => (await currentClient()).migrate(...args),
  transaction: async (...args: Parameters<Client["transaction"]>) => (await currentClient()).transaction(...args),
  executeMultiple: async (...args: Parameters<Client["executeMultiple"]>) => (await currentClient()).executeMultiple(...args),
  sync: async () => (await currentClient()).sync(),
  close: () => {},
  closed: false,
  protocol: "file",
} as unknown as Client;

export const db = drizzle(scoped, { schema });
export { schema };
