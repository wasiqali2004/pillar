import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLog,
  quranBookmarks,
  quranNotes,
  quranReading,
} from "@/lib/db/schema";
import { ALL_SURAHS } from "@/lib/widgets/deen/surahs";
import type { Bookmark, Note, ReadingPosition } from "./types";

/** Reading progress, bookmarks and reflections. Never the Quran text. */

const NOTE_MAX = 5000;

function ayahCount(surah: number) {
  return ALL_SURAHS.find((s) => s.number === surah)?.ayahs ?? 0;
}

function assertAyah(surah: number, ayah: number) {
  const count = ayahCount(surah);
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > count) {
    throw new Error(`Ayah ${surah}:${ayah} does not exist.`);
  }
}

/* ── reading position ─────────────────────────────────────────── */

export async function getPosition(surah: number): Promise<ReadingPosition | null> {
  const [row] = await db
    .select()
    .from(quranReading)
    .where(eq(quranReading.surahNumber, surah))
    .limit(1);
  return row ?? null;
}

export async function listPositions(): Promise<ReadingPosition[]> {
  return db.select().from(quranReading).orderBy(desc(quranReading.updatedAt));
}

export async function savePosition(surah: number, ayah: number, page: number) {
  assertAyah(surah, ayah);
  const updatedAt = new Date().toISOString();
  // Not audited: this fires on every page turn and would drown the log.
  await db
    .insert(quranReading)
    .values({ surahNumber: surah, ayah, page, updatedAt })
    .onConflictDoUpdate({
      target: quranReading.surahNumber,
      set: { ayah, page, updatedAt },
    });
}

/* ── bookmarks ────────────────────────────────────────────────── */

export async function listBookmarks(surah?: number): Promise<Bookmark[]> {
  const q = db.select().from(quranBookmarks);
  return (surah ? q.where(eq(quranBookmarks.surahNumber, surah)) : q).orderBy(
    desc(quranBookmarks.createdAt),
  );
}

export async function toggleBookmark(
  surah: number,
  ayah: number,
  kind: Bookmark["kind"],
) {
  assertAyah(surah, ayah);
  const where = and(
    eq(quranBookmarks.surahNumber, surah),
    eq(quranBookmarks.ayah, ayah),
    eq(quranBookmarks.kind, kind),
  );
  const [existing] = await db.select().from(quranBookmarks).where(where).limit(1);

  if (existing) {
    await db.delete(quranBookmarks).where(eq(quranBookmarks.id, existing.id));
  } else {
    await db.insert(quranBookmarks).values({ surahNumber: surah, ayah, kind });
  }

  await db.insert(auditLog).values({
    actor: "user",
    action: existing ? "quran.bookmark.remove" : "quran.bookmark.add",
    tableName: "quran_bookmarks",
    rowId: existing?.id,
    payload: { surah, ayah, kind },
  });

  return listBookmarks(surah);
}

/* ── notes ────────────────────────────────────────────────────── */

export async function listNotes(surah?: number): Promise<Note[]> {
  const q = db.select().from(quranNotes);
  return (surah ? q.where(eq(quranNotes.surahNumber, surah)) : q).orderBy(
    desc(quranNotes.updatedAt),
  );
}

function cleanBody(body: string) {
  const b = body.trim();
  if (!b) throw new Error("Note is empty.");
  return b.slice(0, NOTE_MAX);
}

export async function addNote(surah: number, ayah: number | null, body: string) {
  if (ayah != null) assertAyah(surah, ayah);
  else if (!ayahCount(surah)) throw new Error(`Surah ${surah} does not exist.`);

  const [row] = await db
    .insert(quranNotes)
    .values({ surahNumber: surah, ayah, body: cleanBody(body) })
    .returning({ id: quranNotes.id });

  await db.insert(auditLog).values({
    actor: "user",
    action: "quran.note.add",
    tableName: "quran_notes",
    rowId: row.id,
    payload: { surah, ayah },
  });
  return listNotes(surah);
}

export async function updateNote(id: number, body: string) {
  const [row] = await db
    .update(quranNotes)
    .set({ body: cleanBody(body), updatedAt: new Date().toISOString() })
    .where(eq(quranNotes.id, id))
    .returning({ surah: quranNotes.surahNumber });
  if (!row) throw new Error("Note not found.");

  await db.insert(auditLog).values({
    actor: "user",
    action: "quran.note.edit",
    tableName: "quran_notes",
    rowId: id,
  });
  return listNotes(row.surah);
}

export async function deleteNote(id: number) {
  const [row] = await db
    .delete(quranNotes)
    .where(eq(quranNotes.id, id))
    .returning({ surah: quranNotes.surahNumber, body: quranNotes.body });
  if (!row) throw new Error("Note not found.");

  // The body goes into the audit payload so a mis-tap is recoverable.
  await db.insert(auditLog).values({
    actor: "user",
    action: "quran.note.delete",
    tableName: "quran_notes",
    rowId: id,
    payload: { surah: row.surah, body: row.body },
  });
  return listNotes(row.surah);
}

/** For Rafiq's tool layer. */
export async function readingSummary() {
  const [positions, bookmarks, notes] = await Promise.all([
    listPositions(),
    listBookmarks(),
    listNotes(),
  ]);
  const name = (n: number) =>
    ALL_SURAHS.find((s) => s.number === n)?.name ?? `Surah ${n}`;
  return {
    last_read: positions[0]
      ? {
          surah: name(positions[0].surahNumber),
          ayah: positions[0].ayah,
          at: positions[0].updatedAt,
        }
      : null,
    surahs_started: positions.length,
    bookmarks: bookmarks.map((b) => `${name(b.surahNumber)} ${b.surahNumber}:${b.ayah}`),
    notes: notes.length,
  };
}
