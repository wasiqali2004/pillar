/**
 * Client-safe types and constants for the Quran reader. No server imports —
 * the reader component pulls from here, so anything that touches the database
 * or the filesystem belongs in ./source.ts or ./store.ts instead.
 */

export type ChapterMeta = {
  number: number;
  nameSimple: string;
  nameArabic: string;
  translatedName: string;
  revelationPlace: "makkah" | "madinah";
  revelationOrder: number;
  versesCount: number;
  bismillahPre: boolean;
};

export type Verse = {
  ayah: number;
  /** "67:3" */
  key: string;
  /** Uthmani script, exactly as served by the source. Never edited. */
  arabic: string;
  translation: string;
  /** Page in the standard 604-page Madani mushaf. */
  mushafPage: number;
  juz: number;
  sajdah: boolean;
};

export type SurahIntro = {
  /** Sanitised HTML. */
  html: string;
  shortText: string;
  source: string;
};

export type SurahText = {
  chapter: ChapterMeta;
  verses: Verse[];
  intro: SurahIntro | null;
};

export type TafsirGroup = {
  /** The commentary covers ayahs `from`..`to` inclusive. */
  from: number;
  to: number;
  html: string;
  /** Section headings from the commentary, or an excerpt when it has none. */
  preview: string[];
};

export type TafsirPayload = {
  sourceId: TafsirId;
  groups: TafsirGroup[];
};

export type Bookmark = {
  id: number;
  surahNumber: number;
  ayah: number;
  kind: "ayah" | "page";
  createdAt: string;
};

export type Note = {
  id: number;
  surahNumber: number;
  ayah: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ReadingPosition = {
  surahNumber: number;
  ayah: number;
  page: number;
  updatedAt: string;
};

/**
 * Every text shown in the reader, with who it is from. The UI renders these
 * credits verbatim — if a source is swapped, this is the one place to change.
 */
export const QURAN_TEXT_SOURCE =
  "Uthmani script (Hafs ʿan ʿAsim) via Quran.com";

export const TRANSLATION = {
  id: 20,
  name: "Saheeh International",
} as const;

export const TAFSIR_SOURCES = [
  {
    id: 169,
    name: "Tafsir Ibn Kathir (Abridged)",
    author: "Hafiz Ibn Kathir",
  },
  {
    id: 168,
    name: "Ma'arif al-Qur'an",
    author: "Mufti Muhammad Shafi",
  },
] as const;

export type TafsirId = (typeof TAFSIR_SOURCES)[number]["id"];

export function isTafsirId(n: number): n is TafsirId {
  return TAFSIR_SOURCES.some((s) => s.id === n);
}

/** 1 → "١" — Arabic-Indic digits for the ayah medallions. */
export function arabicDigits(n: number) {
  return n.toLocaleString("ar-EG", { useGrouping: false });
}

/**
 * Loosens Arabic for search only: drops harakat, Quranic annotation marks and
 * tatweel, and folds alef/yaa/taa-marbuta variants. The displayed text is
 * never passed through this.
 */
export function foldArabic(s: string) {
  return s
    .replace(/[ً-ٰٟۖ-ۭ࣓-ࣿـ]/g, "")
    .replace(/[ٱأإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}
