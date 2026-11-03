"use client";

import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  CATALOG,
  CATALOG_BY_ID,
  CLASSIC_LAYOUT,
  CATEGORY_LABELS,
  SIZE_NAMES,
  moveTo,
  normalizeLayout,
  placeWidget,
  rowCount,
  type Category,
  type LayoutItem,
  type Span,
  type WidgetId,
} from "@/lib/dashboard/catalog";
import { saveLayoutAction } from "@/lib/dashboard/actions";
import { useFlip } from "./useFlip";

export type DashItem = { id: WidgetId; title: string; span: Span; node: ReactNode };

const SPAN_CLASS: Record<Span, string> = {
  3: "md:col-span-1 xl:col-span-3",
  6: "md:col-span-2 xl:col-span-6",
  9: "md:col-span-2 xl:col-span-9",
  12: "md:col-span-2 xl:col-span-12",
};

/* Customize mode is shared between the header button and the grid, which are
   separate client islands inside a server-rendered page. */
let editing = false;
const listeners = new Set<() => void>();
function setEditing(v: boolean) {
  editing = v;
  listeners.forEach((l) => l());
}
function useEditing() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => editing,
    () => false,
  );
}

export function CustomizeButton() {
  const on = useEditing();
  return (
    <button
      type="button"
      className="pill"
      onClick={() => setEditing(!on)}
    >
      <span className="inline-block">{on ? "✓" : "⊞"}</span>
      {on ? "Done" : "Customize"}
    </button>
  );
}

const sig = (l: LayoutItem[]) => l.map((i) => `${i.id}:${i.span}`).join(",");

export function DashboardGrid({
  items,
  header,
  footer,
}: {
  items: DashItem[];
  header: ReactNode;
  footer: ReactNode;
}) {
  const isEditing = useEditing();
  const [, start] = useTransition();
  const [saving, setSaving] = useState(false);

  // The layout as the server last rendered it, and the user's edits on top.
  // When the server catches up (or Rafiq changes it), its version wins.
  const server = useMemo(() => items.map(({ id, span }) => ({ id, span })), [items]);
  const [local, setLocal] = useState<LayoutItem[]>(server);
  const [seen, setSeen] = useState(sig(server));
  if (sig(server) !== seen) {
    setSeen(sig(server));
    setLocal(server);
  }

  const nodes = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const grid = useRef<HTMLDivElement>(null);
  useFlip(grid, sig(local) + (isEditing ? "e" : ""));

  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const [overId, setOverId] = useState<WidgetId | null>(null);

  function commit(next: LayoutItem[]) {
    const clean = normalizeLayout(next);
    setLocal(clean);
    setSaving(true);
    start(async () => {
      await saveLayoutAction(clean);
      setSaving(false);
    });
  }

  const move = (id: WidgetId, to: number) => {
    const from = local.findIndex((i) => i.id === id);
    commit(moveTo(local, from, to));
  };
  const resize = (id: WidgetId, span: Span) => commit(local.map((i) => (i.id === id ? { ...i, span } : i)));
  const remove = (id: WidgetId) => commit(local.filter((i) => i.id !== id));
  const add = (id: WidgetId) => commit(placeWidget(local, id));

  const onDash = new Set(local.map((i) => i.id));
  const addable = CATALOG.filter((c) => !onDash.has(c.id));

  const flat = local.filter((i) => !CATALOG_BY_ID.get(i.id)!.tall);
  const tall = local.filter((i) => CATALOG_BY_ID.get(i.id)!.tall);
  // The classic view: when everything fits in two or three rows, the
  // dashboard locks to the screen so every widget is visible at once, and
  // Training follows below the fold. A single row would stretch to the whole
  // screen, and bigger layouts scroll, so both keep fixed row heights. So does
  // Customize mode, which needs the room for its controls.
  const rows = rowCount(local);
  const locked = !isEditing && rows >= 2 && rows <= 3;

  const cell = (item: LayoutItem) => {
    const idx = local.indexOf(item);
    const entry = CATALOG_BY_ID.get(item.id)!;
    const node = nodes.get(item.id)?.node;
    const dragging = dragId === item.id;
    const over = overId === item.id && dragId !== item.id;
    return (
      <section
        key={item.id}
        data-flip={item.id}
        aria-label={entry.title}
        draggable={isEditing}
        onDragStart={(e) => {
          setDragId(item.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", item.id);
        }}
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          if (overId !== item.id) setOverId(item.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId && dragId !== item.id) move(dragId, idx);
          setDragId(null);
          setOverId(null);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverId(null);
        }}
        className={`${entry.tall ? "" : SPAN_CLASS[item.span]} relative flex min-h-0 flex-col ${
          isEditing ? "dash-editing cursor-grab active:cursor-grabbing" : ""
        } ${dragging ? "opacity-40" : ""} ${over ? "dash-drop-target" : ""}`}
      >
        {isEditing && (
          <div className="dash-controls">
            <span className="dash-grip" aria-hidden>
              ⋮⋮
            </span>
            <span className="mr-auto truncate font-semibold">{entry.title}</span>
            {entry.spans.length > 1 && (
              <span className="flex gap-1" role="group" aria-label={`${entry.title} size`}>
                {entry.spans.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`dash-size ${item.span === s ? "is-on" : ""}`}
                    onClick={() => resize(item.id, s)}
                    aria-pressed={item.span === s}
                  >
                    {SIZE_NAMES[s]}
                  </button>
                ))}
              </span>
            )}
            {!entry.tall && (
              <>
                <button
                  type="button"
                  className="dash-icon"
                  aria-label={`Move ${entry.title} earlier`}
                  disabled={idx === 0}
                  onClick={() => move(item.id, idx - 1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="dash-icon"
                  aria-label={`Move ${entry.title} later`}
                  disabled={idx === local.length - 1}
                  onClick={() => move(item.id, idx + 1)}
                >
                  →
                </button>
              </>
            )}
            <button
              type="button"
              className="dash-icon dash-remove"
              aria-label={`Remove ${entry.title}`}
              onClick={() => remove(item.id)}
            >
              ×
            </button>
          </div>
        )}

        <div className={`flex min-h-0 flex-1 flex-col ${isEditing ? "pointer-events-none select-none" : ""}`}>
          {node ?? <PendingTile title={entry.title} />}
        </div>
      </section>
    );
  };

  return (
    <div className="flex flex-col">
      <div className={`flex flex-col ${locked ? "xl:h-dvh xl:min-h-[680px]" : ""}`}>
        {header}

        {isEditing && (
          <div className="rafiq-in mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-line-soft bg-surface/60 px-4 py-3 text-sm">
            <span className="text-muted">
              Drag widgets to rearrange, pick a size, or remove what you don&apos;t need. Changes save as you go.
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span className="font-mono text-[0.68rem] text-faint">{saving ? "saving…" : "saved"}</span>
              <button type="button" className="pill pill-inactive" onClick={() => commit(CLASSIC_LAYOUT)}>
                Classic layout
              </button>
              <Link href="/welcome" className="pill pill-inactive">
                Redo setup
              </Link>
            </span>
          </div>
        )}

        {local.length === 0 && !isEditing && (
          <div className="rafiq-in flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-line px-6 py-16 text-center">
            <p className="text-lg font-semibold">Your dashboard is empty</p>
            <p className="max-w-md text-sm text-muted">Add the widgets you want, or ask Rafiq to set it up for you.</p>
            <button type="button" className="pill pill-highlight" onClick={() => setEditing(true)}>
              Add widgets
            </button>
          </div>
        )}

        <div ref={grid} className="flex min-h-0 flex-1 flex-col">
          <div
            className={`grid grid-cols-1 gap-5 md:auto-rows-[380px] md:grid-cols-2 xl:grid-cols-12 ${
              locked ? "xl:min-h-0 xl:flex-1 xl:[grid-template-rows:var(--dash-rows)]" : "xl:auto-rows-[400px]"
            }`}
            style={{ "--dash-rows": ROW_TEMPLATES[rows] ?? "none" } as CSSProperties}
          >
            {flat.map(cell)}
          </div>
        </div>

        {footer}
      </div>

      {/* Full-width sections (Training) sit below the fold, as in the classic view. */}
      {tall.length > 0 && <div className="mt-6 flex flex-col gap-8 xl:mt-8">{tall.map(cell)}</div>}

      {isEditing && <AddTray entries={addable} onAdd={add} />}
    </div>
  );
}

/** Row heights for the one-screen view: the top row a little taller, the last a little shorter, as in the classic view. */
const ROW_TEMPLATES: Record<number, string> = {
  2:"1.15fr 1fr",
  3: "1.15fr 1fr 0.85fr",
};

function AddTray({ entries, onAdd }: { entries: typeof CATALOG; onAdd: (id: WidgetId) => void }) {
  if (entries.length === 0) {
    return <p className="mt-6 text-center text-sm text-muted">Every widget is on your dashboard.</p>;
  }
  const byCat = new Map<Category, typeof CATALOG>();
  for (const e of entries) byCat.set(e.category, [...(byCat.get(e.category) ?? []), e]);

  return (
    <div className="rafiq-in mt-8">
      <h2 className="mb-3 flex items-center gap-3 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-faint">
        Add a widget
        <span className="h-px flex-1 bg-line-soft" />
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[...byCat.entries()].map(([cat, list]) =>
          list.map((e) => (
            <button key={e.id} type="button" className="dash-add" onClick={() => onAdd(e.id)}>
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{e.title}</span>
                <span className="text-[0.6rem] uppercase tracking-[0.14em] text-faint">{CATEGORY_LABELS[cat]}</span>
              </span>
              <span className="text-xs leading-relaxed text-muted">{e.blurb}</span>
              {e.replaces && (
                <span className="text-[0.68rem] text-faint">
                  Replaces {e.replaces.map((r) => CATALOG_BY_ID.get(r)!.title).join(" + ")}
                </span>
              )}
              <span className="dash-add-plus">+ Add</span>
            </button>
          )),
        )}
      </div>
    </div>
  );
}

function PendingTile({ title }: { title: string }) {
  return (
    <div className="tile-3d">
      <div className="tile animate-pulse">
        <div className="tile-title text-faint">{title}</div>
        <div className="track mt-4" />
      </div>
    </div>
  );
}
