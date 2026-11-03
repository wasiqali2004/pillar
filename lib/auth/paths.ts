import "server-only";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Where private data lives on disk: one small database of accounts, and one
 * database file per user. PILLAR_DATA_DIR lets a host point this at a
 * persistent volume, and lets tests run against a throwaway copy.
 */
export function dataDir() {
  return process.env.PILLAR_DATA_DIR ?? join(process.cwd(), "data");
}

const USER_ID = /^[0-9a-f-]{36}$/;

export function userDbPath(userId: string) {
  // Ids are UUIDs we generate, but this ends up as a path on disk, so it's
  // checked rather than trusted.
  if (!USER_ID.test(userId)) throw new Error("Bad user id.");
  const dir = join(dataDir(), "users");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${userId}.db`);
}

export function authDbPath() {
  mkdirSync(dataDir(), { recursive: true });
  return join(dataDir(), "auth.db");
}

/** pathToFileURL handles Windows separators and spaces; string concat doesn't. */
export function fileUrl(path: string) {
  return pathToFileURL(path).href;
}

/** The single database from before accounts existed, claimed by the first sign-up. */
export function legacyDbPath() {
  return join(process.env.PILLAR_DATA_DIR ?? process.cwd(), "pillar.db");
}
