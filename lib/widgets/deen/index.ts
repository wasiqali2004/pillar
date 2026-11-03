import "server-only";
import { eq } from "drizzle-orm";
import { defineWidget } from "../types";
import { DeenTile } from "./DeenTile";
import { db } from "@/lib/db";
import { surahProgress, auditLog } from "@/lib/db/schema";
import { loadPrayers, markPrayer, prayerSummary } from "../prayers";
import type { PrayersData } from "../prayers";
import type { PrayerName } from "@/lib/db/schema";
import { ALL_SURAHS } from "./surahs";
import { readingSummary } from "@/lib/quran/store";
import { PRAYER_NAMES } from "@/lib/db/schema";

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

export type DeenData = {
  prayers: PrayersData;
  quran: QuranData;
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

async function loadDeen(): Promise<DeenData> {
  const [prayers, quran] = await Promise.all([loadPrayers(), loadQuran()]);
  return { prayers, quran };
}

/** Tap order: done → memorizing → clear. Mirrored by NEXT_STATUS in DeenTile. */
const NEXT = {
  not_started: "memorized",
  memorized: "learning",
  learning: "not_started",
} as const;

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

export async function addSurah(surahNumber: number) {
  const info = ALL_SURAHS.find((s) => s.number === surahNumber);
  if (!info) return { ok: false as const, error: "Unknown surah number." };

  const existing = await db
    .select({ id: surahProgress.id })
    .from(surahProgress)
    .where(eq(surahProgress.surahNumber, surahNumber))
    .limit(1);

  if (existing.length > 0) return { ok: true as const, existed: true };

  const maxSort = await db
    .select({ s: surahProgress.sortOrder })
    .from(surahProgress)
    .orderBy(surahProgress.sortOrder)
    .limit(1);

  const nextSort =
    maxSort.length > 0
      ? (
          await db
            .select({ s: surahProgress.sortOrder })
            .from(surahProgress)
        ).reduce((m, r) => Math.max(m, r.s), 0) + 1
      : 0;

  await db.insert(surahProgress).values({
    surahNumber: info.number,
    name: info.name,
    ayahCount: info.ayahs,
    status: "not_started",
    sortOrder: nextSort,
  });

  await db.insert(auditLog).values({
    actor: "user",
    action: "surah.add",
    tableName: "surah_progress",
    payload: { surahNumber, name: info.name },
  });

  return { ok: true as const, existed: false };
}

export async function removeSurah(surahNumber: number) {
  await db
    .delete(surahProgress)
    .where(eq(surahProgress.surahNumber, surahNumber));

  await db.insert(auditLog).values({
    actor: "user",
    action: "surah.remove",
    tableName: "surah_progress",
    payload: { surahNumber },
  });

  return { ok: true as const };
}

async function quranSummary() {
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

export const deenWidget = defineWidget<DeenData>({
  id: "deen",
  title: "Deen",
  size: "lg",
  span: 6,
  group: { id: "deen", label: "Deen" },
  refresh: "live",
  load: loadDeen,
  Tile: DeenTile,
  tools: [
    {
      name: "get_prayer_status",
      description:
        "Today's five prayer times, which have been prayed, and the current all-five streak.",
      input_schema: { type: "object", properties: {} },
      handler: prayerSummary,
    },
    {
      name: "log_prayer",
      description: "Mark one of the five daily prayers as prayed today.",
      input_schema: {
        type: "object",
        properties: {
          prayer: { type: "string", enum: [...PRAYER_NAMES] },
        },
        required: ["prayer"],
      },
      write: true,
      handler: ({ prayer }: { prayer: PrayerName }) => markPrayer(prayer),
    },
    {
      name: "get_memorization_status",
      description:
        "Quran memorization progress: surahs memorized, in progress, and total ayahs memorized.",
      input_schema: { type: "object", properties: {} },
      handler: quranSummary,
    },
    {
      name: "get_quran_reading",
      description:
        "Quran reading (not memorization): the surah and ayah last read, how many surahs have been opened, bookmarked ayahs, and how many reflection notes exist.",
      input_schema: { type: "object", properties: {} },
      handler: readingSummary,
    },
  ],
});
