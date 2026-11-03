"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";

/**
 * Cards inside this grid get a soft light that follows the pointer.
 * One listener on the grid writes --mx/--my onto whichever card is under it.
 */
export function SpotlightGrid({ className, children }: { className?: string; children: ReactNode }) {
  function onMove(e: PointerEvent<HTMLDivElement>) {
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-spot]");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  }
  return (
    <div className={className} onPointerMove={onMove}>
      {children}
    </div>
  );
}

/**
 * Adds `is-visible` to its children's wrapper the first time it scrolls into
 * view, so sections animate in as you reach them rather than all at load.
 */
export function Reveal({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`lp-reveal ${className}`}>
      {children}
    </div>
  );
}
