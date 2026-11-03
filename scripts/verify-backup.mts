/**
 * Proves the backup is restorable. Dumps the live db, restores it into a
 * throwaway file, and compares row counts table by table.
 *
 * This is the Phase 0 gate. Run it after any schema change.
 */
import { ownerDbUrl } from "./lib/owner-db.mts";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { rm } from "node:fs/promises";
import { dump } from "./backup.mts";

const SCRATCH = "pillar-restore-test.db";
const sourceUrl = await ownerDbUrl();

console.log(`· dumping ${sourceUrl}`);
const snapshot = await dump(sourceUrl, process.env.DATABASE_AUTH_TOKEN);

await rm(SCRATCH, { force: true });
const scratch = createClient({ url: `file:${SCRATCH}` });

console.log("· building scratch schema");
await migrate(drizzle(scratch), { migrationsFolder: "./drizzle" });

// Tables restore in alphabetical order, so a child can land before its parent
// (habit_logs before habits). Defer enforcement, then check integrity at the
// end — that verifies referential integrity across the whole restore rather
// than just row-by-row on insert.
console.log("· restoring");
await scratch.execute("PRAGMA foreign_keys = OFF");

for (const table of snapshot.names) {
  const rows = snapshot.tables[table] as Record<string, unknown>[];
  if (rows.length === 0) continue;
  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
  for (const row of rows) {
    await scratch.execute({
      sql,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: cols.map((c) => (row[c] ?? null) as any),
    });
  }
}

const orphans = await scratch.execute("PRAGMA foreign_key_check");
if (orphans.rows.length > 0) {
  console.log(`\n✗ ${orphans.rows.length} orphaned row(s) after restore`);
}

console.log("· comparing\n");
let ok = orphans.rows.length === 0;
for (const table of snapshot.names) {
  const expected = (snapshot.tables[table] as unknown[]).length;
  const res = await scratch.execute(`SELECT COUNT(*) AS n FROM ${table}`);
  const actual = Number(res.rows[0].n);
  const match = expected === actual;
  if (!match) ok = false;
  console.log(
    `  ${match ? "✓" : "✗"} ${table.padEnd(16)} ${String(expected).padStart(5)} → ${String(actual).padStart(5)}`,
  );
}

scratch.close();
console.log(ok ? "\n✓ backup restores cleanly" : "\n✗ RESTORE MISMATCH");

// Windows can hold the file handle briefly after close(); the next run starts
// with rm -f anyway, so a failure to clean up here is not a failed verification.
await rm(SCRATCH, { force: true }).catch(() => {});
process.exit(ok ? 0 : 1);
