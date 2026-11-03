"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * FLIP animation for reordering: children marked `data-flip="<id>"` glide
 * from where they were to where they now are whenever `key` changes, instead
 * of jumping. Positions are kept relative to the container so a page scroll
 * between two changes doesn't read as movement.
 */
export function useFlip(container: RefObject<HTMLElement | null>, key: unknown) {
  const last = useRef(new Map<string, { x: number; y: number }>());

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const kids = Array.from(root.querySelectorAll<HTMLElement>("[data-flip]"));

    // Measure everything before animating anything: an animation applies its
    // first frame immediately and would skew the later measurements.
    const now = new Map(
      kids.map((el) => {
        const r = el.getBoundingClientRect();
        return [el.dataset.flip!, { x: r.left - origin.left, y: r.top - origin.top }];
      }),
    );

    if (!reduce) {
      for (const el of kids) {
        const before = last.current.get(el.dataset.flip!);
        const after = now.get(el.dataset.flip!)!;
        if (!before) {
          el.animate(
            [
              { opacity: 0, transform: "scale(0.96)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          );
          continue;
        }
        const dx = before.x - after.x;
        const dy = before.y - after.y;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: 420,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
      }
    }
    last.current = now;
  }, [container, key]);
}
