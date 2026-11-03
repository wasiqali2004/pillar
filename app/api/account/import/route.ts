import { writeFileSync, rmSync } from "node:fs";
import { createClient } from "@libsql/client";
import { runAsUser } from "@/lib/auth/context";
import { fileUrl, userDbPath } from "@/lib/auth/paths";
import { getSessionUser } from "@/lib/auth/session";
import { replaceUserDb } from "@/lib/db";
import { getPrayerSettings, savePrayerSettings } from "@/lib/widgets/prayers/settings";

export const dynamic = "force-dynamic";

/** Above the home database's size by far, and under the 10MB the proxy reads. */
const MAX_BYTES = 9 * 1024 * 1024;
const SQLITE_HEADER = "SQLite format 3\0";

/**
 * The owner moving their home install onto the server: uploads pillar.db, which
 * replaces their own (new, nearly empty) database. Owner only, because it runs a
 * file someone supplied through SQLite, and it can only ever touch their own data.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!user.isOwner) return Response.json({ error: "Not found." }, { status: 404 });

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose your pillar.db file." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is too large to be pillar.db." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, SQLITE_HEADER.length).toString("latin1") !== SQLITE_HEADER) {
    return Response.json({ error: "That isn't a Pillar database file." }, { status: 400 });
  }

  const incoming = `${userDbPath(user.id)}.${Date.now()}.incoming`;
  writeFileSync(incoming, bytes, { mode: 0o600 });
  try {
    const check = createClient({ url: fileUrl(incoming) });
    try {
      const ok = await check.execute("PRAGMA integrity_check");
      const tables = await check.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_settings'");
      if (String(ok.rows[0]?.[0]) !== "ok" || tables.rows.length === 0) {
        throw new Error("not a pillar database");
      }
    } finally {
      check.close();
    }
  } catch {
    try {
      rmSync(incoming, { force: true });
    } catch {
      // Held open for a moment on Windows. Harmless: it's never read again.
    }
    return Response.json({ error: "That isn't a Pillar database file." }, { status: 400 });
  }

  await replaceUserDb(user.id, incoming);

  // Prayer times used to be fixed in the code, so an older file has no settings.
  await runAsUser(user.id, user.timezone, async () => {
    if (!(await getPrayerSettings())) {
      await savePrayerSettings({ latitude: 43.6532, longitude: -79.3832, place: "Toronto", method: "NorthAmerica", madhab: "shafi" });
    }
  });

  return Response.json({ ok: true });
}
