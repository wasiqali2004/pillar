/**
 * Nightly dump of every table to JSON.
 *
 * A year of habit logs exists nowhere else — this is the only copy that
 * survives a paused free-tier database. Pair it with verify-backup.mts;
 * an untested backup is a guess.
 */
import { ownerDbUrl } from "./lib/owner-db.mts";
import { createClient } from "@libsql/client";
import { writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const jsonSafe = (_k: string, v: unknown) =>
  typeof v === "bigint" ? Number(v) : v;

/**
 * Discovered from the database rather than hardcoded. A hardcoded list silently
 * stops covering tables added later — which is the one failure mode a backup
 * must not have.
 */
async function tableNames(client: ReturnType<typeof createClient>) {
  const res = await client.execute(
    `SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name NOT LIKE '__drizzle%'
      ORDER BY name`,
  );
  return res.rows.map((r) => String(r.name));
}

export async function dump(url: string, authToken?: string) {
  const client = createClient({ url, authToken });
  const names = await tableNames(client);
  const tables: Record<string, unknown[]> = {};
  for (const t of names) {
    const res = await client.execute(`SELECT * FROM "${t}"`);
    tables[t] = res.rows;
  }
  client.close();
  return { takenAt: new Date().toISOString(), source: url, tables, names };
}

// Run directly (not when imported by verify-backup). pathToFileURL handles
// Windows separators and spaces in the path — string concat does not.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = await ownerDbUrl();
  const data = await dump(url, process.env.DATABASE_AUTH_TOKEN);

  await mkdir("backups", { recursive: true });
  const file = `backups/${data.takenAt.slice(0, 10)}.json`;
  await writeFile(file, JSON.stringify(data, jsonSafe, 2), "utf8");

  const total = Object.values(data.tables).reduce((n, r) => n + r.length, 0);
  console.log(`✓ backed up ${total} rows across ${data.names.length} tables → ${file}`);
}
