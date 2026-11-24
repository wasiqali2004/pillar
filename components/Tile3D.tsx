"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Maximum tilt in degrees at the far corners. Past ~8° the text distorts. */
const MAX_TILT = 6;
/** How far the slab rises toward the viewer on hover. */
const LIFT = 14;

/**
 * Broadcast when any tile expands, so the others collapse. Without this two
 * tiles can end up stacked over the same backdrop, each thinking it owns it.
 */
const EXPAND_EVENT = "pillar:tile-expand";

import { INTERACTIVE, forwardMisHitClick } from "./forwardClick";

/**
 * The 3D stage a tile sits on, and the thing that expands it.
 *
 * Tilt: tracks the pointer and writes CSS custom properties — `--rx` / `--ry`
 * drive the rotation, `--mx` / `--my` position the specular highlight,
 * `--lift` raises the slab. Writes go through rAF so a fast sweep across eight
 * tiles doesn't queue eight style recalcs per frame. Coarse pointers get the
 * static raised look, since there is no hover to drive it.
 *
 * Expand: clicking dead space on a tile pins it over a backdrop at full size.
 * This deliberately does NOT re-render the children somewhere else — the same
 * DOM node is repositioned, so a tile mid-optimistic-update (a prayer just
 * ticked, a surah mid-cycle) keeps its state through the transition. That is
 * also why `.tile-3d` drops its perspective while open: a `perspective` (like
 * a `transform`) makes the element a containing block for fixed descendants,
 * so the expanded tile would anchor to its grid cell instead of the viewport.
 */
export function Tile3D({
  children,
  className = "",
  /** Opt out for tiles that own their whole cell already. */
  expandable = true,
  /** False keeps the slab still under the pointer — for very wide tiles,
      where the tilt and parallax planes stretch the header past the edges. */
  tilt = true,
}: {
  children: ReactNode;
  className?: string;
  expandable?: boolean;
  tilt?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [expanded, setExpanded] = useState(false);
  /** Identifies this tile in the broadcast below; stable across renders. */
  const id = useId();

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el || !tilt || expanded || e.pointerType !== "mouse") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const { left, top, width, height } = el.getBoundingClientRect();
      const px = (e.clientX - left) / width;
      const py = (e.clientY - top) / height;

      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
        // Right of centre tilts the right edge away; above centre tilts the top
        // toward the viewer — the way a physical panel would follow a finger.
        el.style.setProperty("--ry", `${((px - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
        el.style.setProperty("--rx", `${((0.5 - py) * 2 * MAX_TILT).toFixed(2)}deg`);
        el.style.setProperty("--lift", `${LIFT}px`);
      });
    },
    [expanded, tilt],
  );

  const reset = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--lift", "0px");
    el.style.setProperty("--mx", "50%");
    el.style.setProperty("--my", "35%");
  }, []);

  const open = useCallback(() => {
    reset();
    setExpanded(true);
    window.dispatchEvent(new CustomEvent(EXPAND_EVENT, { detail: id }));
  }, [reset, id]);

  /** A click on the tile's own surface — not on a control inside it. */
  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!expandable || expanded) return;
      const t = e.target as Element | null;
      if (t?.closest(INTERACTIVE)) return;
      // A click meant for a control that Chrome handed to the surface behind it.
      if (forwardMisHitClick(e)) return;
      // A click that ended a text selection isn't a click on the tile.
      if (window.getSelection()?.toString()) return;
      open();
    },
    [expandable, expanded, open],
  );

  // Escape to close, and stand down when another tile takes over.
  useEffect(() => {
    if (!expanded) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) setExpanded(false);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener(EXPAND_EVENT, onOther);

    // Lock the page behind the overlay, restoring whatever was there before
    // rather than assuming "" — the dashboard may already be locked.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EXPAND_EVENT, onOther);
      document.body.style.overflow = prev;
    };
  }, [expanded, id]);

  return (
    <>
      {expanded && (
        <div
          className="tile-backdrop"
          onClick={() => setExpanded(false)}
          aria-hidden="true"
        />
      )}
      <div
        ref={ref}
        className={`tile-3d ${expandable ? "is-expandable" : ""} ${
          expanded ? "is-expanded" : ""
        } ${tilt ? "" : "is-flat"} ${className}`}
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
        onPointerCancel={reset}
        onClick={onClick}
      >
        {expandable && !expanded && (
          <button
            type="button"
            className="tile-expand"
            onClick={open}
            aria-label="Expand"
            title="Expand"
          >
            ⤢
          </button>
        )}
        {expanded && (
          <button
            type="button"
            className="tile-collapse"
            onClick={() => setExpanded(false)}
            aria-label="Close"
            title="Close (Esc)"
          >
            ✕
          </button>
        )}
        {children}
      </div>
    </>
  );
}
