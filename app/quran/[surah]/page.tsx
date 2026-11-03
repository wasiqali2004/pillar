import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { surahProgress } from "@/lib/db/schema";
import { getChapters, getSurah } from "@/lib/quran/source";
import { getPosition, listBookmarks, listNotes } from "@/lib/quran/store";
import { Reader } from "@/lib/quran/Reader";

export const dynamic = "force-dynamic";

function parseSurah(raw: string) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 114 ? n : null;
}

export async function generateMetadata(
  props: PageProps<"/quran/[surah]">,
): Promise<Metadata> {
  const n = parseSurah((await props.params).surah);
  if (!n) return { title: "Quran" };
  try {
    const c = (await getChapters()).find((c) => c.number === n);
    return { title: `${c?.nameSimple ?? `Surah ${n}`} · Quran` };
  } catch {
    return { title: `Surah ${n} · Quran` };
  }
}

export default async function SurahPage(props: PageProps<"/quran/[surah]">) {
  const n = parseSurah((await props.params).surah);
  if (!n) notFound();

  const sp = await props.searchParams;
  const ayahParam = Number(Array.isArray(sp.ayah) ? sp.ayah[0] : sp.ayah);

  let surah;
  let chapters;
  try {
    [surah, chapters] = await Promise.all([getSurah(n), getChapters()]);
  } catch (e) {
    return <LoadError message={e instanceof Error ? e.message : String(e)} />;
  }
  if (!surah) notFound();

  // The basmala shown above a surah is taken from Al-Fatihah's first ayah in
  // the same source, rather than typed in here, so it can't drift from the text.
  let bismillah: string | null = null;
  if (surah.chapter.bismillahPre) {
    try {
      bismillah = (await getSurah(1))?.verses[0]?.arabic ?? null;
    } catch {
      bismillah = null;
    }
  }

  const [position, bookmarks, notes, [memo]] = await Promise.all([
    getPosition(n),
    listBookmarks(n),
    listNotes(n),
    db
      .select({ status: surahProgress.status })
      .from(surahProgress)
      .where(eq(surahProgress.surahNumber, n))
      .limit(1),
  ]);

  const explicitAyah =
    Number.isInteger(ayahParam) &&
    ayahParam >= 1 &&
    ayahParam <= surah.chapter.versesCount
      ? ayahParam
      : null;

  return (
    <Reader
      // Keyed so moving to the next surah starts a fresh reader instead of
      // carrying the previous surah's page index across.
      key={n}
      surah={surah}
      bismillah={bismillah}
      startAyah={explicitAyah ?? position?.ayah ?? 1}
      jumpTo={explicitAyah}
      initialBookmarks={bookmarks}
      initialNotes={notes}
      prev={chapters.find((c) => c.number === n - 1) ?? null}
      next={chapters.find((c) => c.number === n + 1) ?? null}
      memorization={memo?.status ?? null}
    />
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-5 py-16 text-center">
      <h1 className="text-xl font-semibold">This surah couldn&apos;t be loaded</h1>
      <p className="text-sm leading-relaxed text-muted">
        The Quran text is fetched from Quran.com the first time a surah is
        opened, then kept on this machine. That first fetch failed, and nothing
        partial was saved — Pillar won&apos;t show an incomplete surah.
      </p>
      <p className="font-mono text-xs text-faint">{message}</p>
      <Link href="/quran" className="pill">
        Back to the library
      </Link>
    </main>
  );
}
