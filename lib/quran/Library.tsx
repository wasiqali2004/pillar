"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Ornament } from "./Ornament";
import { arabicDigits, type Bookmark, type ChapterMeta, type ReadingPosition } from "./types";

type MemoStatus = "not_started" | "learning" | "memorized";
type Filter = "all" | "hifz" | "started" | "makkah" | "madinah";

export function Library({
  chapters,
  positions,
  bookmarks,
  memorization,
  now,
}: {
  chapters: ChapterMeta[];
  positions: ReadingPosition[];
  bookmarks: Bookmark[];
  memorization: Record<number, MemoStatus>;
  /** Server time, so "2h ago" renders the same on server and client. */
  now: number;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const byNumber = useMemo(
    () => new Map(chapters.map((c) => [c.number, c])),
    [chapters],
  );
  const positionOf = useMemo(
    () => new Map(positions.map((p) => [p.surahNumber, p])),
    [positions],
  );

  const last = positions[0];
  const lastChapter = last ? byNumber.get(last.surahNumber) : undefined;

  const shown = chapters.filter((c) => {
    if (filter === "hifz" && !memorization[c.number]) return false;
    if (filter === "started" && !positionOf.has(c.number)) return false;
    if (filter === "makkah" && c.revelationPlace !== "makkah") return false;
    if (filter === "madinah" && c.revelationPlace !== "madinah") return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      String(c.number) === s ||
      c.nameSimple.toLowerCase().includes(s) ||
      c.translatedName.toLowerCase().includes(s) ||
      c.nameArabic.includes(q.trim())
    );
  });

  const filters: [Filter, string][] = [
    ["all", "All 114"],
    ["hifz", "Memorization list"],
    ["started", "Reading"],
    ["makkah", "Meccan"],
    ["madinah", "Medinan"],
  ];

  return (
    <main className="quran-library mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-7 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/app" className="text-[0.72rem] text-faint hover:text-teal">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            <span className="grad-text">The Quran</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Open a surah to read the Arabic, its translation, and — when you
            want it — the scholarship around it.
          </p>
        </div>
        <span className="quran-ar text-4xl leading-none text-[#d4b77a]/80" lang="ar" dir="rtl">
          القرآن الكريم
        </span>
      </header>

      {/* ── continue + bookmarks ── */}
      {(lastChapter || bookmarks.length > 0) && (
        <section className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          {lastChapter && last && (
            <Link href={`/quran/${last.surahNumber}?ayah=${last.ayah}`} className="continue-card group">
              <div className="min-w-0">
                <p className="commentary-kind">Continue reading</p>
                <h2 className="mt-1 truncate text-xl font-semibold">
                  {lastChapter.nameSimple}
                  <span className="ml-2 text-sm font-normal text-muted">
                    {lastChapter.translatedName}
                  </span>
                </h2>
                <p className="tnum mt-1 text-xs text-muted">
                  From ayah {last.ayah} of {lastChapter.versesCount} · page {last.page} ·{" "}
                  {timeAgo(last.updatedAt, now)}
                </p>
                <div className="track mt-3 max-w-xs">
                  <div
                    className="track-fill grad"
                    style={{ width: `${Math.max(3, (last.ayah / lastChapter.versesCount) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="quran-ar text-4xl text-[#d4b77a]" lang="ar" dir="rtl">
                {lastChapter.nameArabic}
              </span>
            </Link>
          )}

          {bookmarks.length > 0 && (
            <div className="library-panel">
              <p className="commentary-kind">Bookmarks</p>
              <ul className="mt-2 flex max-h-[9.5rem] flex-col gap-1 overflow-y-auto pr-1 deen-scroll">
                {bookmarks.map((b) => {
                  const c = byNumber.get(b.surahNumber);
                  return (
                    <li key={b.id}>
                      <Link
                        href={`/quran/${b.surahNumber}?ayah=${b.ayah}`}
                        className="flex items-center gap-3 rounded-ctl px-2 py-1.5 text-sm hover:bg-surface-hi"
                      >
                        <span className="tnum w-14 shrink-0 font-mono text-[0.68rem] text-faint">
                          {b.surahNumber}:{b.ayah}
                        </span>
                        <span className="flex-1 truncate">{c?.nameSimple}</span>
                        <span className="text-[0.62rem] uppercase tracking-wider text-faint">
                          {b.kind}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── filters ── */}
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, meaning or number"
          className="field !w-full sm:!w-72"
          aria-label="Search surahs"
        />
        <div className="flex flex-wrap gap-1.5">
          {filters.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`pill ${filter === id ? "pill-selected" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── surahs ── */}
      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((c) => {
          const pos = positionOf.get(c.number);
          const memo = memorization[c.number];
          return (
            <li key={c.number}>
              <Link href={`/quran/${c.number}`} className="surah-card">
                <span className="surah-star tnum" aria-hidden>
                  {c.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.95rem] font-medium text-ink">
                    {c.nameSimple}
                  </span>
                  <span className="block truncate text-[0.7rem] text-muted">
                    {c.translatedName}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-[0.62rem] text-faint">
                    <span>{c.revelationPlace === "makkah" ? "Meccan" : "Medinan"}</span>
                    <span>·</span>
                    <span className="tnum">{c.versesCount} ayahs</span>
                    {memo === "memorized" && <span className="memo-chip">Memorized</span>}
                    {memo === "learning" && <span className="memo-chip is-learning">Memorizing</span>}
                  </span>
                  {pos && (
                    <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-line/60">
                      <span
                        className="block h-full grad"
                        style={{ width: `${Math.max(4, (pos.ayah / c.versesCount) * 100)}%` }}
                      />
                    </span>
                  )}
                </span>
                <span className="quran-ar shrink-0 text-2xl text-[#d4b77a]/90" lang="ar" dir="rtl">
                  {c.nameArabic}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && (
        <p className="mt-6 text-sm text-faint">No surahs match.</p>
      )}

      <footer className="mt-10 flex flex-col items-center gap-2 pb-4 text-center text-[0.68rem] text-faint">
        <Ornament />
        <p>
          Arabic text, Saheeh International translation and tafsir are loaded
          from Quran.com and cached on this machine unchanged. {arabicDigits(114)}{" "}
          surahs · 6,236 ayahs.
        </p>
      </footer>
    </main>
  );
}

function timeAgo(iso: string, now: number) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
