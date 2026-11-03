import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { surahProgress } from "@/lib/db/schema";
import { getChapters } from "@/lib/quran/source";
import { listBookmarks, listPositions } from "@/lib/quran/store";
import { Library } from "@/lib/quran/Library";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Quran" };

export default async function QuranLibraryPage() {
  let chapters;
  try {
    chapters = await getChapters();
  } catch (e) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-5 py-16 text-center">
        <h1 className="text-xl font-semibold">The surah list couldn&apos;t be loaded</h1>
        <p className="text-sm text-muted">
          It&apos;s fetched from Quran.com once and then kept locally. Check the
          connection and reload.
        </p>
        <p className="font-mono text-xs text-faint">
          {e instanceof Error ? e.message : String(e)}
        </p>
        <Link href="/app" className="pill">
          Dashboard
        </Link>
      </main>
    );
  }

  const [positions, bookmarks, memo] = await Promise.all([
    listPositions(),
    listBookmarks(),
    db
      .select({ n: surahProgress.surahNumber, status: surahProgress.status })
      .from(surahProgress),
  ]);

  return (
    <Library
      chapters={chapters}
      positions={positions}
      bookmarks={bookmarks}
      memorization={Object.fromEntries(memo.map((m) => [m.n, m.status]))}
      now={new Date().getTime()}
    />
  );
}
