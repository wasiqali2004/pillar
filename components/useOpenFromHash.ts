"use client";

import { useEffect, type RefObject } from "react";

/**
 * Opens a tile's log form when the page is reached by a link like
 * /app#log-workout, and brings it into view. The Connect page's "log it
 * yourself" buttons use these, so someone without an app lands on the form,
 * not on a dashboard they then have to search.
 */
export function useOpenFromHash(hash: string, open: () => void, scrollTo?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const check = () => {
      if (window.location.hash !== hash) return;
      open();
      // Clear it, so a later refresh doesn't keep reopening the form.
      history.replaceState(null, "", window.location.pathname + window.location.search);
      window.setTimeout(() => scrollTo?.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
    // Runs once per hash; `open` is a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);
}
