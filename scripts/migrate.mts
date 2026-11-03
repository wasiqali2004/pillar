import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

/**
 * Brings every database up to date. Rarely needed by hand: the app migrates a
 * user's file the first time it opens it. Useful before a backup, or to check
 * a new migration applies cleanly across everyone.
 */
const dir = process.env.PILLAR_DATA_DIR ?? join(process.cwd(), "data");
const usersDir = join(dir, "users");

const targets = [
  ...(existsSync("pillar.db") ? ["pillar.db"] : []),
  ...(existsSync(usersDir)
    ? readdirSync(usersDir)
        .filter((f) => f.endsWith(".db"))
        .map((f) => join(usersDir, f))
    : []),
];

for (const file of targets) {
  const client = createClient({ url: pathToFileURL(file).href });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  client.close();
}
console.log(`✓ migrations applied to ${targets.length} database${targets.length === 1 ? "" : "s"}`);
