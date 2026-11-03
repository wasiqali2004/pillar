"use client";

import Link from "next/link";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  addNoteAction,
  deleteNoteAction,
  savePositionAction,
  toggleBookmarkAction,
  updateNoteAction,
} from "./actions";
import { usePrefs, type ReaderPrefs } from "./prefs";
import { Ornament } from "./Ornament";
import {
  QURAN_TEXT_SOURCE,
  TAFSIR_SOURCES,
  TRANSLATION,
  arabicDigits,
  foldArabic,
  type Bookmark,
  type ChapterMeta,
  type Note,
  type SurahText,
  type TafsirGroup,
  type TafsirPayload,
  type Verse,
} from "./types";

type Page = { mushafPage: number; juz: number; verses: Verse[] };
type Panel = "search" | "bookmarks" | "notes";
type Turning = { dir: 1 | -1; phase: "out" | "in" } | null;

const TURN_MS = 260;

export function Reader({
  surah,
  bismillah,
  startAyah,
  jumpTo,
  initialBookmarks,
  initialNotes,
  prev,
  next,
  memorization,
}: {
  surah: SurahText;
  bismillah: string | null;
  startAyah: number;
  jumpTo: number | null;
  initialBookmarks: Bookmark[];
  initialNotes: Note[];
  prev: ChapterMeta | null;
  next: ChapterMeta | null;
  memorization: "not_started" | "learning" | "memorized" | null;
}) {
  const { chapter, verses, intro } = surah;
  const [prefs, setPrefs] = usePrefs();

  /* ── pages ──
     A page is the part of this surah on one page of the standard Madani
     mushaf, so page breaks fall where they do in a printed copy. */
  const pages = useMemo<Page[]>(() => {
    const out: Page[] = [];
    for (const v of verses) {
      const last = out.at(-1);
      if (last && last.mushafPage === v.mushafPage) last.verses.push(v);
      else out.push({ mushafPage: v.mushafPage, juz: v.juz, verses: [v] });
    }
    return out;
  }, [verses]);

  const pageOf = (ayah: number) =>
    Math.max(
      0,
      pages.findIndex((p) => p.verses.some((v) => v.ayah === ayah)),
    );

  const [pageIdx, setPageIdx] = useState(() => pageOf(startAyah));
  const [turning, setTurning] = useState<Turning>(null);
  const [highlight, setHighlight] = useState<number | null>(jumpTo);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [noteAyah, setNoteAyah] = useState<number | null>(null);
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  const [notes, setNotes] = useState(initialNotes);

  const page = pages[pageIdx];
  const lastAyahOnPage = page.verses.at(-1)!.ayah;
  const pct = (lastAyahOnPage / chapter.versesCount) * 100;
  const bookRef = useRef<HTMLDivElement>(null);

  /* ── progress ── */
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const persist = (idx: number) => {
    const first = pages[idx].verses[0].ayah;
    window.history.replaceState(null, "", `?ayah=${first}`);
    clearTimeout(saveTimer.current);
    // Debounced: flicking through five pages is one save, not five.
    saveTimer.current = setTimeout(() => {
      void savePositionAction(chapter.number, first, idx + 1);
    }, 700);
  };

  // Opening a surah counts as reading it — that's what makes "Continue
  // reading" in the library point here.
  useEffect(() => {
    const first = pages[pageIdx].verses[0].ayah;
    void savePositionAction(chapter.number, first, pageIdx + 1);
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── page turning ── */
  const scrollToBook = () => {
    const el = bookRef.current;
    if (el && el.getBoundingClientRect().top < 0) {
      el.scrollIntoView({ block: "start" });
    }
  };

  const go = (target: number, then?: () => void) => {
    if (target < 0 || target >= pages.length || turning) return;
    if (target === pageIdx) {
      then?.();
      return;
    }
    persist(target);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPageIdx(target);
      scrollToBook();
      then?.();
      return;
    }

    const dir = target > pageIdx ? 1 : -1;
    setTurning({ dir, phase: "out" });
    setTimeout(() => {
      setPageIdx(target);
      setTurning({ dir, phase: "in" });
      scrollToBook();
      then?.();
      setTimeout(() => setTurning(null), TURN_MS);
    }, TURN_MS);
  };

  const jumpToAyah = (ayah: number) => {
    go(pageOf(ayah), () => {
      setHighlight(ayah);
      setTimeout(() => setHighlight((h) => (h === ayah ? null : h)), 2600);
    });
    if (window.matchMedia("(max-width: 900px)").matches) setPanel(null);
  };

  // Bring a jumped-to ayah into view once its page is on screen.
  useEffect(() => {
    if (highlight == null) return;
    document
      .getElementById(`ayah-${highlight}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, pageIdx]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select, [contenteditable]")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowRight") go(pageIdx + 1);
    else if (e.key === "ArrowLeft") go(pageIdx - 1);
    else if (e.key === "Escape") setPanel(null);
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Horizontal swipe on touch screens.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") touch.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      go(pageIdx + (dx < 0 ? 1 : -1));
    }
  };

  /* ── commentary ── */
  const [tafsir, setTafsir] = useState<Record<number, TafsirPayload | { error: string }>>({});
  const current = tafsir[prefs.tafsir];

  useEffect(() => {
    if (!prefs.context || tafsir[prefs.tafsir]) return;
    const id = prefs.tafsir;
    let alive = true;
    fetch(`/api/quran/tafsir/${chapter.number}?source=${id}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body as TafsirPayload;
      })
      .then(
        (p) => alive && setTafsir((t) => ({ ...t, [id]: p })),
        (e: unknown) =>
          alive &&
          setTafsir((t) => ({
            ...t,
            [id]: { error: e instanceof Error ? e.message : "Unavailable" },
          })),
      );
    return () => {
      alive = false;
    };
  }, [prefs.context, prefs.tafsir, chapter.number, tafsir]);

  const groups: TafsirGroup[] =
    current && "groups" in current ? current.groups : [];
  const onPage = new Set(page.verses.map((v) => v.ayah));
  // Commentary sits after the last ayah it covers. A passage that starts here
  // but finishes on a later page gets a pointer instead of a duplicate.
  const continuesLater = groups.filter(
    (g) => onPage.has(g.from) && !onPage.has(g.to) && g.to > lastAyahOnPage,
  );
  const tafsirSource = TAFSIR_SOURCES.find((s) => s.id === prefs.tafsir)!;

  /* ── bookmarks & notes ── */
  const [, startTransition] = useTransition();

  const isMarked = (ayah: number, kind: Bookmark["kind"]) =>
    bookmarks.some((b) => b.ayah === ayah && b.kind === kind);

  const toggleMark = (ayah: number, kind: Bookmark["kind"]) => {
    const on = isMarked(ayah, kind);
    setBookmarks((bs) =>
      on
        ? bs.filter((b) => !(b.ayah === ayah && b.kind === kind))
        : [
            {
              id: -Date.now(),
              surahNumber: chapter.number,
              ayah,
              kind,
              createdAt: new Date().toISOString(),
            },
            ...bs,
          ],
    );
    startTransition(async () => {
      setBookmarks(await toggleBookmarkAction(chapter.number, ayah, kind));
    });
  };

  const notesByAyah = useMemo(() => {
    const m = new Map<number, number>();
    for (const n of notes) if (n.ayah != null) m.set(n.ayah, (m.get(n.ayah) ?? 0) + 1);
    return m;
  }, [notes]);

  const openNoteFor = (ayah: number | null) => {
    setNoteAyah(ayah);
    setPanel("notes");
  };

  const pageMarked = isMarked(page.verses[0].ayah, "page");
  const isLast = pageIdx === pages.length - 1;

  const flipClass = turning
    ? `is-turning-${turning.phase} dir-${turning.dir === 1 ? "next" : "prev"}`
    : "";

  return (
    <div
      className="quran-reader"
      data-theme={prefs.theme}
      style={{ "--quran-scale": prefs.scale } as React.CSSProperties}
    >
      {/* ── toolbar ── */}
      <header className="reader-bar">
        <div className="reader-bar-inner">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/quran" className="reader-icon-btn" aria-label="Back to the surah library" title="Surah library">
              <Icon name="back" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="truncate text-[0.95rem] font-semibold">
                  {chapter.nameSimple}
                </h1>
                <span className="arabic-ui whitespace-nowrap text-base leading-snug text-muted" lang="ar" dir="rtl">
                  {chapter.nameArabic}
                </span>
              </div>
              <p className="truncate text-[0.68rem] text-faint">
                Surah {chapter.number} · {chapter.translatedName} ·{" "}
                {chapter.versesCount} ayahs
              </p>
            </div>
          </div>

          <div className="reader-controls">
            <Toggle
              on={prefs.translation}
              onClick={() => setPrefs({ translation: !prefs.translation })}
              label="Translation"
            />
            <Toggle
              on={prefs.context}
              onClick={() => setPrefs({ context: !prefs.context })}
              label="Context"
            />
            <span className="reader-sep" />
            <button
              type="button"
              className="reader-icon-btn"
              onClick={() => setPrefs({ scale: clampScale(prefs.scale - 0.1) })}
              disabled={prefs.scale <= 0.8}
              aria-label="Smaller text"
              title="Smaller text"
            >
              <span className="text-[0.7rem] font-semibold">A−</span>
            </button>
            <button
              type="button"
              className="reader-icon-btn"
              onClick={() => setPrefs({ scale: clampScale(prefs.scale + 0.1) })}
              disabled={prefs.scale >= 1.6}
              aria-label="Larger text"
              title="Larger text"
            >
              <span className="text-[0.85rem] font-semibold">A+</span>
            </button>
            <button
              type="button"
              className="reader-icon-btn"
              onClick={() =>
                setPrefs({ theme: prefs.theme === "night" ? "paper" : "night" })
              }
              aria-label={prefs.theme === "night" ? "Switch to paper page" : "Switch to night page"}
              title={prefs.theme === "night" ? "Paper page" : "Night page"}
            >
              <Icon name={prefs.theme === "night" ? "sun" : "moon"} />
            </button>
            <span className="reader-sep" />
            <PanelBtn panel="search" active={panel} set={setPanel} label="Search this surah" />
            <PanelBtn panel="bookmarks" active={panel} set={setPanel} label="Bookmarks" count={bookmarks.length} />
            <PanelBtn panel="notes" active={panel} set={setPanel} label="Notes & reflections" count={notes.length} />
          </div>
        </div>
        <div className="reader-progress" aria-hidden>
          <div style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div className={`reader-layout ${panel ? "has-panel" : ""}`}>
        <main className="reader-main">
          {prefs.context && (
            <ContextNotice
              prefs={prefs}
              setPrefs={setPrefs}
              state={
                current == null ? "loading" : "error" in current ? current.error : "ok"
              }
              onRetry={() =>
                setTafsir((t) => {
                  const rest = { ...t };
                  delete rest[prefs.tafsir];
                  return rest;
                })
              }
            />
          )}

          {/* ── the page ── */}
          <div
            ref={bookRef}
            className="book-stage"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          >
            <article
              className={`mushaf-page ${flipClass}`}
              aria-label={`Page ${pageIdx + 1} of ${pages.length}`}
            >
              <div className="mushaf-frame">
                <div className="mushaf-running">
                  <span>Juz {page.juz}</span>
                  <span className="quran-ar" lang="ar" dir="rtl">
                    سورة {chapter.nameArabic}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleMark(page.verses[0].ayah, "page")}
                    className={`page-ribbon ${pageMarked ? "is-on" : ""}`}
                    aria-pressed={pageMarked}
                    aria-label={pageMarked ? "Remove page bookmark" : "Bookmark this page"}
                    title={pageMarked ? "Page bookmarked" : "Bookmark this page"}
                  >
                    <Icon name="ribbon" />
                  </button>
                </div>

                {pageIdx === 0 && (
                  <SurahHeading chapter={chapter} bismillah={bismillah} memorization={memorization} />
                )}

                {pageIdx === 0 && prefs.context && intro && (
                  <aside className="commentary commentary-intro">
                    <CommentaryLabel
                      kind="About this surah"
                      source={intro.source}
                    />
                    <p className="commentary-lede">{intro.shortText}</p>
                    <details>
                      <summary>Read the full introduction</summary>
                      <div
                        className="commentary-body"
                        dangerouslySetInnerHTML={{ __html: intro.html }}
                      />
                    </details>
                  </aside>
                )}

                <div className="ayat">
                  {page.verses.map((v) => (
                    <Fragment key={v.ayah}>
                      <AyahBlock
                        verse={v}
                        showTranslation={prefs.translation}
                        highlighted={highlight === v.ayah}
                        bookmarked={isMarked(v.ayah, "ayah")}
                        noteCount={notesByAyah.get(v.ayah) ?? 0}
                        onBookmark={() => toggleMark(v.ayah, "ayah")}
                        onNote={() => openNoteFor(v.ayah)}
                      />
                      {prefs.context &&
                        groups
                          .filter((g) => g.to === v.ayah)
                          .map((g) => (
                            <Commentary
                              key={`${g.from}-${g.to}`}
                              group={g}
                              chapter={chapter.number}
                              source={`${tafsirSource.name} · ${tafsirSource.author}`}
                            />
                          ))}
                    </Fragment>
                  ))}

                  {prefs.context &&
                    continuesLater.map((g) => (
                      <p key={g.from} className="commentary-pointer">
                        Commentary on ayahs {g.from}–{g.to} follows ayah {g.to}, on
                        a later page.
                      </p>
                    ))}
                </div>

                {isLast && (
                  <div className="surah-end">
                    <Ornament />
                    <p>End of Surah {chapter.nameSimple}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" className="pill" onClick={() => openNoteFor(null)}>
                        Write a reflection
                      </button>
                      {next && (
                        <Link href={`/quran/${next.number}`} className="pill">
                          Next: {next.nameSimple} →
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                <div className="mushaf-folio" title={`Mushaf page ${page.mushafPage}`}>
                  <span lang="ar">{arabicDigits(page.mushafPage)}</span>
                </div>
              </div>
            </article>
          </div>

          <p className="reader-credit">
            Arabic: {QURAN_TEXT_SOURCE}. English: {TRANSLATION.name}. The
            translation conveys meaning; it is not the Quran itself.
          </p>
        </main>

        {panel && (
          <SidePanel
            panel={panel}
            setPanel={setPanel}
            verses={verses}
            chapter={chapter}
            bookmarks={bookmarks}
            notes={notes}
            setNotes={setNotes}
            noteAyah={noteAyah}
            setNoteAyah={setNoteAyah}
            onJump={jumpToAyah}
            onRemoveMark={(b) => toggleMark(b.ayah, b.kind)}
          />
        )}
      </div>

      {/* ── page controls ── */}
      <nav className="reader-nav" aria-label="Page navigation">
        <div className="reader-nav-inner">
          {pageIdx > 0 ? (
            <button type="button" className="turn-btn" onClick={() => go(pageIdx - 1)}>
              <Icon name="prev" /> <span>Previous page</span>
            </button>
          ) : prev ? (
            <Link href={`/quran/${prev.number}`} className="turn-btn turn-btn-quiet">
              <Icon name="prev" /> <span>{prev.nameSimple}</span>
            </Link>
          ) : (
            <span className="turn-btn is-disabled" aria-hidden>
              <Icon name="prev" /> <span>Previous page</span>
            </span>
          )}

          <div className="reader-nav-meta">
            <div className="tnum text-[0.8rem] font-medium text-ink">
              Page {pageIdx + 1} <span className="text-faint">of {pages.length}</span>
            </div>
            <div className="tnum text-[0.64rem] text-faint">
              Ayahs {page.verses[0].ayah}–{lastAyahOnPage} · {Math.round(pct)}% of surah
            </div>
          </div>

          {!isLast ? (
            <button type="button" className="turn-btn turn-btn-primary" onClick={() => go(pageIdx + 1)}>
              <span>Next page</span> <Icon name="next" />
            </button>
          ) : next ? (
            <Link href={`/quran/${next.number}`} className="turn-btn turn-btn-quiet">
              <span>{next.nameSimple}</span> <Icon name="next" />
            </Link>
          ) : (
            <span className="turn-btn is-disabled" aria-hidden>
              <span>Next page</span> <Icon name="next" />
            </span>
          )}
        </div>
      </nav>
    </div>
  );
}

function clampScale(n: number) {
  return Math.round(Math.min(1.6, Math.max(0.8, n)) * 10) / 10;
}

/* ── page pieces ─────────────────────────────────────────────── */

function SurahHeading({
  chapter,
  bismillah,
  memorization,
}: {
  chapter: ChapterMeta;
  bismillah: string | null;
  memorization: "not_started" | "learning" | "memorized" | null;
}) {
  return (
    <div className="surah-heading">
      <div className="surah-cartouche">
        <span className="quran-ar" lang="ar" dir="rtl">
          سورة {chapter.nameArabic}
        </span>
      </div>
      <p className="surah-heading-meta">
        {chapter.translatedName} ·{" "}
        {chapter.revelationPlace === "makkah" ? "Meccan" : "Medinan"} ·{" "}
        {chapter.versesCount} ayahs
        {memorization === "memorized" && <span className="memo-chip">Memorized</span>}
        {memorization === "learning" && <span className="memo-chip is-learning">Memorizing</span>}
      </p>
      {bismillah && (
        <p className="bismillah quran-ar" lang="ar" dir="rtl">
          {bismillah}
        </p>
      )}
    </div>
  );
}

function AyahBlock({
  verse,
  showTranslation,
  highlighted,
  bookmarked,
  noteCount,
  onBookmark,
  onNote,
}: {
  verse: Verse;
  showTranslation: boolean;
  highlighted: boolean;
  bookmarked: boolean;
  noteCount: number;
  onBookmark: () => void;
  onNote: () => void;
}) {
  return (
    <section
      id={`ayah-${verse.ayah}`}
      className={`ayah ${highlighted ? "is-highlighted" : ""}`}
      aria-label={`Ayah ${verse.key}`}
    >
      <div className="ayah-tools">
        <span className="ayah-ref tnum">{verse.key}</span>
        {verse.sajdah && <span className="sajdah-chip">Sajdah</span>}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onNote}
          className={`ayah-tool ${noteCount ? "is-on" : ""}`}
          aria-label={`Add a note on ayah ${verse.ayah}`}
          title={noteCount ? `${noteCount} note${noteCount > 1 ? "s" : ""}` : "Add a note"}
        >
          <Icon name="note" />
          {noteCount > 0 && <span className="tnum">{noteCount}</span>}
        </button>
        <button
          type="button"
          onClick={onBookmark}
          className={`ayah-tool ${bookmarked ? "is-on" : ""}`}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? `Remove bookmark on ayah ${verse.ayah}` : `Bookmark ayah ${verse.ayah}`}
          title={bookmarked ? "Bookmarked" : "Bookmark ayah"}
        >
          <Icon name="bookmark" filled={bookmarked} />
        </button>
      </div>

      <p className="ayah-ar quran-ar" lang="ar" dir="rtl">
        {verse.arabic}{" "}
        <span className="ayah-num" aria-label={`ayah ${verse.ayah}`}>
          {arabicDigits(verse.ayah)}
        </span>
      </p>

      {showTranslation && (
        <p className="ayah-en">
          <span className="ayah-en-num tnum">{verse.ayah}</span>
          {verse.translation}
        </p>
      )}
    </section>
  );
}

function CommentaryLabel({ kind, source }: { kind: string; source: string }) {
  return (
    <div className="commentary-label">
      <span className="commentary-kind">{kind}</span>
      <span className="commentary-source">{source}</span>
    </div>
  );
}

function Commentary({
  group,
  chapter,
  source,
}: {
  group: TafsirGroup;
  chapter: number;
  source: string;
}) {
  const span =
    group.from === group.to
      ? `Ayah ${chapter}:${group.from}`
      : `Ayahs ${chapter}:${group.from}–${group.to}`;
  return (
    <aside className="commentary">
      <CommentaryLabel kind={`Commentary · ${span}`} source={source} />
      <ul className="commentary-preview">
        {group.preview.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      <details>
        <summary>Read the commentary</summary>
        <div
          className="commentary-body"
          dangerouslySetInnerHTML={{ __html: group.html }}
        />
      </details>
    </aside>
  );
}

function ContextNotice({
  prefs,
  setPrefs,
  state,
  onRetry,
}: {
  prefs: ReaderPrefs;
  setPrefs: (p: Partial<ReaderPrefs>) => void;
  state: "loading" | "ok" | string;
  onRetry: () => void;
}) {
  return (
    <div className="context-notice">
      <div className="flex flex-wrap items-center gap-2">
        <span className="commentary-kind">Context on</span>
        <label className="sr-only" htmlFor="tafsir-source">
          Commentary source
        </label>
        <select
          id="tafsir-source"
          className="field !w-auto !py-1 !pl-2 !pr-7 !text-xs"
          value={prefs.tafsir}
          onChange={(e) =>
            setPrefs({ tafsir: Number(e.target.value) as ReaderPrefs["tafsir"] })
          }
        >
          {TAFSIR_SOURCES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.author}
            </option>
          ))}
        </select>
        {state === "loading" && <span className="text-[0.7rem] text-faint">Loading commentary…</span>}
        {state !== "loading" && state !== "ok" && (
          <span className="text-[0.7rem] text-bad">
            Commentary unavailable ({state}).{" "}
            <button type="button" className="underline" onClick={onRetry}>
              Retry
            </button>
          </span>
        )}
      </div>
      <p>
        Boxed sections are classical and modern <em>tafsir</em> — human
        scholarship quoted verbatim from its source via Quran.com, each labelled
        with its author. They explain the text; they are not the Quran, and
        scholars differ on some points, including the circumstances of
        revelation. Pillar does not write or summarise any of it.
      </p>
    </div>
  );
}

/* ── side panel ──────────────────────────────────────────────── */

function SidePanel({
  panel,
  setPanel,
  verses,
  chapter,
  bookmarks,
  notes,
  setNotes,
  noteAyah,
  setNoteAyah,
  onJump,
  onRemoveMark,
}: {
  panel: Panel;
  setPanel: (p: Panel | null) => void;
  verses: Verse[];
  chapter: ChapterMeta;
  bookmarks: Bookmark[];
  notes: Note[];
  setNotes: (n: Note[]) => void;
  noteAyah: number | null;
  setNoteAyah: (a: number | null) => void;
  onJump: (ayah: number) => void;
  onRemoveMark: (b: Bookmark) => void;
}) {
  const titles: Record<Panel, string> = {
    search: "Search this surah",
    bookmarks: "Bookmarks",
    notes: "Notes & reflections",
  };
  return (
    <aside className="reader-panel" aria-label={titles[panel]}>
      <div className="reader-panel-head">
        <div className="flex gap-1">
          {(Object.keys(titles) as Panel[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPanel(p)}
              className={`panel-tab ${p === panel ? "is-active" : ""}`}
            >
              {p === "search" ? "Search" : p === "bookmarks" ? "Bookmarks" : "Notes"}
            </button>
          ))}
        </div>
        <button type="button" className="reader-icon-btn" onClick={() => setPanel(null)} aria-label="Close panel">
          <Icon name="close" />
        </button>
      </div>

      <div className="reader-panel-body deen-scroll">
        {panel === "search" && <SearchPanel verses={verses} onJump={onJump} />}
        {panel === "bookmarks" && (
          <BookmarksPanel bookmarks={bookmarks} verses={verses} onJump={onJump} onRemove={onRemoveMark} />
        )}
        {panel === "notes" && (
          <NotesPanel
            chapter={chapter}
            notes={notes}
            setNotes={setNotes}
            noteAyah={noteAyah}
            setNoteAyah={setNoteAyah}
            onJump={onJump}
          />
        )}
      </div>
    </aside>
  );
}

function SearchPanel({ verses, onJump }: { verses: Verse[]; onJump: (a: number) => void }) {
  const [q, setQ] = useState("");

  const folded = useMemo(
    () => verses.map((v) => ({ v, ar: foldArabic(v.arabic), en: v.translation.toLowerCase() })),
    [verses],
  );

  const query = q.trim();
  const results = useMemo(() => {
    if (!query) return [];
    if (/^\d+$/.test(query)) {
      const n = Number(query);
      return folded.filter((f) => f.v.ayah === n).map((f) => f.v);
    }
    if (query.length < 2) return [];
    const isArabic = /[؀-ۿ]/.test(query);
    const needle = isArabic ? foldArabic(query) : query.toLowerCase();
    return folded
      .filter((f) => (isArabic ? f.ar.includes(needle) : f.en.includes(needle)))
      .map((f) => f.v);
  }, [folded, query]);

  return (
    <div className="flex flex-col gap-3">
      <input
        autoFocus
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="English, Arabic, or an ayah number"
        className="field"
      />
      <p className="text-[0.66rem] leading-relaxed text-faint">
        Arabic search ignores vowel marks. English searches the{" "}
        {TRANSLATION.name} translation.
      </p>
      {query && (
        <p className="text-[0.7rem] text-muted">
          {results.length} {results.length === 1 ? "match" : "matches"}
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {results.slice(0, 60).map((v) => (
          <li key={v.ayah}>
            <button type="button" onClick={() => onJump(v.ayah)} className="panel-item">
              <span className="ayah-ref tnum">{v.key}</span>
              <span className="line-clamp-3 text-[0.8rem] text-muted">
                <Highlight text={v.translation} q={/[؀-ۿ]/.test(query) ? "" : query} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {results.length > 60 && (
        <p className="text-[0.7rem] text-faint">Showing the first 60 — narrow the search.</p>
      )}
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (q.length < 2) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="search-mark">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function BookmarksPanel({
  bookmarks,
  verses,
  onJump,
  onRemove,
}: {
  bookmarks: Bookmark[];
  verses: Verse[];
  onJump: (a: number) => void;
  onRemove: (b: Bookmark) => void;
}) {
  if (!bookmarks.length) {
    return (
      <p className="text-[0.8rem] leading-relaxed text-faint">
        No bookmarks in this surah yet. Use the bookmark beside any ayah, or the
        ribbon at the top corner of a page.
      </p>
    );
  }
  const sorted = [...bookmarks].sort((a, b) => a.ayah - b.ayah);
  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((b) => {
        const v = verses[b.ayah - 1];
        return (
          <li key={`${b.kind}-${b.ayah}`} className="flex items-start gap-1">
            <button type="button" onClick={() => onJump(b.ayah)} className="panel-item flex-1">
              <span className="ayah-ref tnum">
                {b.kind === "page" ? `Page · from ${v?.key}` : v?.key}
              </span>
              <span className="line-clamp-2 text-[0.8rem] text-muted">{v?.translation}</span>
            </button>
            <button type="button" className="reader-icon-btn mt-1" onClick={() => onRemove(b)} aria-label="Remove bookmark">
              <Icon name="close" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function NotesPanel({
  chapter,
  notes,
  setNotes,
  noteAyah,
  setNoteAyah,
  onJump,
}: {
  chapter: ChapterMeta;
  notes: Note[];
  setNotes: (n: Note[]) => void;
  noteAyah: number | null;
  setNoteAyah: (a: number | null) => void;
  onJump: (a: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<Note[]>, after?: () => void) =>
    startTransition(async () => {
      try {
        setNotes(await fn());
        setError(null);
        after?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          run(() => addNoteAction(chapter.number, noteAyah, draft), () => setDraft(""));
        }}
      >
        <label className="flex items-center justify-between gap-2 text-[0.7rem] text-muted">
          About
          <select
            className="field !w-auto !py-1 !text-xs"
            value={noteAyah ?? ""}
            onChange={(e) => setNoteAyah(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">The whole surah</option>
            {Array.from({ length: chapter.versesCount }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Ayah {chapter.number}:{i + 1}
              </option>
            ))}
          </select>
        </label>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="What stood out? What will you carry with you?"
          className="field resize-y font-[family-name:var(--font-book)] !text-[0.95rem] leading-relaxed"
        />
        <div className="flex items-center justify-between gap-2">
          {error ? <span className="text-[0.7rem] text-bad">{error}</span> : <span />}
          <button type="submit" className="pill pill-selected" disabled={pending || !draft.trim()}>
            Save note
          </button>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-[0.8rem] text-faint">No notes on this surah yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {notes.map((n) => (
            <li key={n.id} className="note-card">
              <div className="flex items-center justify-between gap-2">
                {n.ayah != null ? (
                  <button type="button" className="ayah-ref tnum hover:text-teal" onClick={() => onJump(n.ayah!)}>
                    Ayah {chapter.number}:{n.ayah} →
                  </button>
                ) : (
                  <span className="ayah-ref">Whole surah</span>
                )}
                <span className="tnum text-[0.62rem] text-faint">
                  {new Date(n.updatedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>

              {editing?.id === n.id ? (
                <div className="mt-2 flex flex-col gap-2">
                  <textarea
                    autoFocus
                    value={editing.body}
                    onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                    rows={4}
                    maxLength={5000}
                    className="field resize-y !text-[0.9rem]"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" className="pill" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="pill pill-selected"
                      disabled={pending || !editing.body.trim()}
                      onClick={() => run(() => updateNoteAction(n.id, editing.body), () => setEditing(null))}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="note-body">{n.body}</p>
                  <div className="mt-1.5 flex justify-end gap-3 text-[0.68rem]">
                    {confirmDelete === n.id ? (
                      <>
                        <span className="text-faint">Delete this note?</span>
                        <button type="button" className="text-bad hover:underline" onClick={() => run(() => deleteNoteAction(n.id), () => setConfirmDelete(null))}>
                          Delete
                        </button>
                        <button type="button" className="text-muted hover:underline" onClick={() => setConfirmDelete(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="text-muted hover:text-ink" onClick={() => setEditing({ id: n.id, body: n.body })}>
                          Edit
                        </button>
                        <button type="button" className="text-muted hover:text-bad" onClick={() => setConfirmDelete(n.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── small controls ──────────────────────────────────────────── */

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`reader-toggle ${on ? "is-on" : ""}`}>
      <span className="reader-toggle-dot" />
      {label}
    </button>
  );
}

function PanelBtn({
  panel,
  active,
  set,
  label,
  count,
}: {
  panel: Panel;
  active: Panel | null;
  set: (p: Panel | null) => void;
  label: string;
  count?: number;
}) {
  const on = active === panel;
  return (
    <button
      type="button"
      className={`reader-icon-btn relative ${on ? "is-active" : ""}`}
      onClick={() => set(on ? null : panel)}
      aria-pressed={on}
      aria-label={label}
      title={label}
    >
      <Icon name={panel === "search" ? "search" : panel === "bookmarks" ? "bookmark" : "note"} />
      {!!count && <span className="icon-count tnum">{count}</span>}
    </button>
  );
}

type IconName =
  | "back" | "prev" | "next" | "search" | "bookmark" | "note"
  | "close" | "sun" | "moon" | "ribbon";

function Icon({ name, filled }: { name: IconName; filled?: boolean }) {
  const common = {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4 shrink-0",
    "aria-hidden": true,
  };
  switch (name) {
    case "back":
      return <svg {...common}><path d="M12 4l-6 6 6 6" /></svg>;
    case "prev":
      return <svg {...common}><path d="M12.5 4.5L7 10l5.5 5.5" /></svg>;
    case "next":
      return <svg {...common}><path d="M7.5 4.5L13 10l-5.5 5.5" /></svg>;
    case "search":
      return <svg {...common}><circle cx="9" cy="9" r="5.5" /><path d="M13 13l4 4" /></svg>;
    case "bookmark":
    case "ribbon":
      return (
        <svg {...common} fill={filled || name === "ribbon" ? "currentColor" : "none"}>
          <path d="M5.5 3h9v14l-4.5-3.2L5.5 17z" />
        </svg>
      );
    case "note":
      return <svg {...common}><path d="M4 3.5h12v9.5l-4 4H4z" /><path d="M12 17v-4h4M7 7.5h6M7 10.5h4" /></svg>;
    case "close":
      return <svg {...common}><path d="M5 5l10 10M15 5L5 15" /></svg>;
    case "sun":
      return <svg {...common}><circle cx="10" cy="10" r="3.2" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></svg>;
    case "moon":
      return <svg {...common}><path d="M15.5 12.5A6.5 6.5 0 017.5 4.5a6.5 6.5 0 108 8z" /></svg>;
  }
}
