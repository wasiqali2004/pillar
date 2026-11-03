import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";

/**
 * The command-line tools (imports, backup) work on the owner's data. That's the
 * first account's database, or the original pillar.db if nobody has signed up
 * yet. DATABASE_URL still wins when it points somewhere else on purpose.
 */
export async function ownerDbUrl(): Promise<string> {
  const explicit = process.env.DATABASE_URL;
  if (explicit && explicit !== "file:pillar.db") return explicit;

  const dir = process.env.PILLAR_DATA_DIR ?? join(process.cwd(), "data");
  const authFile = join(dir, "auth.db");
  if (existsSync(authFile)) {
    const auth = createClient({ url: pathToFileURL(authFile).href });
    const r = await auth.execute("SELECT id FROM users WHERE is_owner = 1 LIMIT 1").catch(() => null);
    auth.close();
    const id = r?.rows[0]?.id;
    if (id) return pathToFileURL(join(dir, "users", `${String(id)}.db`)).href;
  }
  return "file:pillar.db";
}
