import "server-only";
import { eq } from "drizzle-orm";
import { defineWidget } from "../types";
import { QuranTile } from "./QuranTile";
import { db } from "@/lib/db";
import { surahProgress, auditLog } from "@/lib/db/schema";

export type SurahRow = {
  surahNumber: number;
  name: string;
  ayahCount: number;
  status: "not_started" | "learning" | "memorized";
};

export type QuranData = {
  rows: SurahRow[];
  memorized: number;
  learning: number;
  total: number;
  ayahsMemorized: number;
  ayahsTotal: number;
};

export async function loadQuran(): Promise<QuranData> {
  const rows = await db
    .select()
    .from(surahProgress)
    .orderBy(surahProgress.sortOrder);

  const memorized = rows.filter((r) => r.status === "memorized");

  return {
    rows: rows.map((r) => ({
      surahNumber: r.surahNumber,
      name: r.name,
      ayahCount: r.ayahCount,
      status: r.status,
    })),
    memorized: memorized.length,
    learning: rows.filter((r) => r.status === "learning").length,
    total: rows.length,
    ayahsMemorized: memorized.reduce((n, r) => n + r.ayahCount, 0),
    ayahsTotal: rows.reduce((n, r) => n + r.ayahCount, 0),
  };
}

const NEXT = {
  not_started: "learning",
  learning: "memorized",
  memorized: "not_started",
} as const;

/** Tapping a surah cycles it forward: not started → learning → memorized. */
export async function cycleSurah(surahNumber: number) {
  const [row] = await db
    .select()
    .from(surahProgress)
    .where(eq(surahProgress.surahNumber, surahNumber))
    .limit(1);

  if (!row) return { status: null };

  const status = NEXT[row.status];
  await db
    .update(surahProgress)
    .set({
      status,
      ayahsDone: status === "memorized" ? row.ayahCount : 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(surahProgress.surahNumber, surahNumber));

  await db.insert(auditLog).values({
    actor: "user",
    action: "surah.status",
    tableName: "surah_progress",
    rowId: row.id,
    payload: { surahNumber, from: row.status, to: status },
  });

  return { status };
}

export async function quranSummary() {
  const d = await loadQuran();
  return {
    memorized: d.memorized,
    learning: d.learning,
    tracked: d.total,
    ayahs_memorized: d.ayahsMemorized,
    ayahs_tracked: d.ayahsTotal,
    in_progress: d.rows
      .filter((r) => r.status === "learning")
      .map((r) => r.name),
  };
}

export const quranWidget = defineWidget<QuranData>({
  id: "quran",
  title: "Memorization",
  size: "sm",
  group: { id: "deen", label: "Deen" },
  refresh: "live",
  load: loadQuran,
  Tile: QuranTile,
  tools: [
    {
      name: "get_memorization_status",
      description:
        "Quran memorization progress: surahs memorized, in progress, and total ayahs memorized.",
      input_schema: { type: "object", properties: {} },
      handler: quranSummary,
    },
  ],
});
