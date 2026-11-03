import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "@/lib/auth/paths";
import {
  TRANSLATION,
  type ChapterMeta,
  type SurahIntro,
  type SurahText,
  type TafsirGroup,
  type TafsirId,
  type TafsirPayload,
  type Verse,
} from "./types";

/**
 * Where every word of the reader comes from.
 *
 * Quran text, translation and commentary are all fetched from the Quran.com
 * API and cached to disk verbatim — Pillar never writes, paraphrases or
 * "tidies" any of it. The only transformations are mechanical: footnote
 * markers are stripped from the translation, and commentary HTML is reduced to
 * a small tag allowlist before it is rendered.
 *
 * The cache makes the reader work offline after a surah's first open, and
 * means a surah is fetched once, not on every page view. Delete data/quran/ to
 * force a refetch.
 */

const API = "https://api.quran.com/api/v4";
const CACHE_DIR = path.join(dataDir(), "quran");
/** Surahs already fetched ship with the app, so a new server needn't fetch them again. */
const BUNDLED_DIR = path.join(process.cwd(), "data", "quran");
const TOTAL_AYAHS = 6236;

/* ── cache ────────────────────────────────────────────────────── */

const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(name: string, load: () => Promise<T>): Promise<T> {
  const file = path.join(CACHE_DIR, `${name}.json`);
  for (const candidate of [file, path.join(BUNDLED_DIR, `${name}.json`)]) {
    try {
      // Runtime paths (the data disk and the shipped cache), not files to bundle:
      // the whole app is copied into the image, so nothing needs tracing here.
      return JSON.parse(await readFile(/* turbopackIgnore: true */ candidate, "utf8")) as T;
    } catch {
      // not cached yet — fall through
    }
  }

  // Two tabs opening the same surah shouldn't fetch it twice.
  const pending = inflight.get(name);
  if (pending) return pending as Promise<T>;

  const p = (async () => {
    const value = await load();
    await mkdir(CACHE_DIR, { recursive: true });
    // Write-then-rename so a crash mid-write can't leave a truncated file
    // that would then be served as the Quran text.
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value));
    await rename(tmp, file);
    return value;
  })().finally(() => inflight.delete(name));

  inflight.set(name, p);
  return p;
}

async function api<T>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${API}${pathAndQuery}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Quran.com API ${res.status} for ${pathAndQuery}`);
  }
  return (await res.json()) as T;
}

/* ── html handling ────────────────────────────────────────────── */

const ALLOWED_TAGS = new Set([
  "p", "h2", "h3", "h4", "h5", "em", "strong", "b", "i", "br",
  "ul", "ol", "li", "blockquote", "span", "sup", "sub", "div",
]);

/**
 * Reduces third-party HTML to bare allowlisted tags with every attribute
 * removed — no attributes means no event handlers, links or styles. Text is
 * untouched.
 */
export function sanitize(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (m, tag: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(t)) return "";
      if (t === "br") return "<br>";
      return m.startsWith("</") ? `</${t}>` : `<${t}>`;
    });
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

function plainText(html: string) {
  return html
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code =
          e[1] === "x" || e[1] === "X"
            ? parseInt(e.slice(2), 16)
            : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/* ── chapters ─────────────────────────────────────────────────── */

type ApiChapter = {
  id: number;
  revelation_place: string;
  revelation_order: number;
  bismillah_pre: boolean;
  name_simple: string;
  name_arabic: string;
  verses_count: number;
  translated_name: { name: string };
};

export function getChapters(): Promise<ChapterMeta[]> {
  return cached("chapters", async () => {
    const { chapters } = await api<{ chapters: ApiChapter[] }>(
      "/chapters?language=en",
    );
    const list = chapters
      .map(
        (c): ChapterMeta => ({
          number: c.id,
          nameSimple: c.name_simple,
          nameArabic: c.name_arabic,
          translatedName: c.translated_name.name,
          revelationPlace:
            c.revelation_place === "madinah" ? "madinah" : "makkah",
          revelationOrder: c.revelation_order,
          versesCount: c.verses_count,
          bismillahPre: c.bismillah_pre,
        }),
      )
      .sort((a, b) => a.number - b.number);

    const ayahs = list.reduce((n, c) => n + c.versesCount, 0);
    if (list.length !== 114 || ayahs !== TOTAL_AYAHS) {
      throw new Error(
        `Chapter list failed integrity check (${list.length} surahs, ${ayahs} ayahs).`,
      );
    }
    return list;
  });
}

export async function getChapter(n: number) {
  const chapters = await getChapters();
  return chapters.find((c) => c.number === n) ?? null;
}

/* ── surah text ───────────────────────────────────────────────── */

type ApiVerse = {
  verse_number: number;
  verse_key: string;
  text_uthmani: string;
  page_number: number;
  juz_number: number;
  sajdah_number: number | null;
  translations: { resource_id: number; text: string }[];
};

type ApiPage<K extends string, V> = Record<K, V[]> & {
  pagination: { next_page: number | null };
};

async function allPages<K extends string, V>(
  key: K,
  base: string,
): Promise<V[]> {
  const out: V[] = [];
  let page: number | null = 1;
  while (page) {
    const sep = base.includes("?") ? "&" : "?";
    const res: ApiPage<K, V> = await api(`${base}${sep}per_page=50&page=${page}`);
    out.push(...res[key]);
    page = res.pagination.next_page;
  }
  return out;
}

export async function getSurah(n: number): Promise<SurahText | null> {
  const chapter = await getChapter(n);
  if (!chapter) return null;

  const [verses, intro] = await Promise.all([
    cached(`surah-${n}-t${TRANSLATION.id}`, () => loadVerses(chapter)),
    getIntro(n),
  ]);

  return { chapter, verses, intro };
}

async function loadVerses(chapter: ChapterMeta): Promise<Verse[]> {
  const raw = await allPages<"verses", ApiVerse>(
    "verses",
    `/verses/by_chapter/${chapter.number}?translations=${TRANSLATION.id}&fields=text_uthmani&words=false`,
  );

  const verses = raw
    .map((v): Verse => {
      const tr = v.translations.find((t) => t.resource_id === TRANSLATION.id);
      return {
        ayah: v.verse_number,
        key: v.verse_key,
        arabic: v.text_uthmani.trim(),
        translation: tr ? plainText(tr.text) : "",
        mushafPage: v.page_number,
        juz: v.juz_number,
        sajdah: v.sajdah_number != null,
      };
    })
    .sort((a, b) => a.ayah - b.ayah);

  // Refuse to cache anything incomplete: a missing ayah is far worse than a
  // failed load, because a failed load is visible.
  const intact =
    verses.length === chapter.versesCount &&
    verses.every(
      (v, i) =>
        v.ayah === i + 1 &&
        v.key === `${chapter.number}:${i + 1}` &&
        v.arabic.length > 0 &&
        v.translation.length > 0,
    );
  if (!intact) {
    throw new Error(
      `Surah ${chapter.number} failed integrity check: expected ${chapter.versesCount} ayahs, got ${verses.length}.`,
    );
  }
  return verses;
}

async function getIntro(n: number): Promise<SurahIntro | null> {
  try {
    return await cached(`intro-${n}`, async () => {
      const { chapter_info: info } = await api<{
        chapter_info: { text: string; short_text: string; source: string };
      }>(`/chapters/${n}/info?language=en`);
      return {
        html: sanitize(info.text),
        shortText: plainText(info.short_text),
        source: info.source,
      };
    });
  } catch {
    // The intro is optional context; the surah still reads without it.
    return null;
  }
}

/* ── tafsir ───────────────────────────────────────────────────── */

type ApiTafsir = { verse_key: string; text: string };

export function getTafsir(n: number, sourceId: TafsirId): Promise<TafsirPayload> {
  return cached(`tafsir-${sourceId}-${n}`, async () => {
    const raw = await allPages<"tafsirs", ApiTafsir>(
      "tafsirs",
      `/tafsirs/${sourceId}/by_chapter/${n}`,
    );

    const rows = raw
      .map((t) => ({ ayah: Number(t.verse_key.split(":")[1]), text: t.text }))
      .filter((t) => Number.isInteger(t.ayah))
      .sort((a, b) => a.ayah - b.ayah);

    // Commentators often treat a passage at once: the source puts the text on
    // the passage's first ayah and leaves the rest empty. Fold those runs
    // back into one block that knows its span.
    const groups: TafsirGroup[] = [];
    for (const r of rows) {
      if (r.text.trim()) {
        const html = sanitize(r.text);
        groups.push({ from: r.ayah, to: r.ayah, html, preview: previewOf(html) });
      } else if (groups.length) {
        groups[groups.length - 1].to = r.ayah;
      }
    }
    return { sourceId, groups };
  });
}

function previewOf(html: string) {
  const headings = [...html.matchAll(/<h[2-5]>([\s\S]*?)<\/h[2-5]>/g)]
    .map((m) => plainText(m[1]))
    .filter(Boolean);
  if (headings.length) return headings.slice(0, 4);

  const text = plainText(html);
  return [text.length > 180 ? `${text.slice(0, 180).trimEnd()}…` : text];
}
