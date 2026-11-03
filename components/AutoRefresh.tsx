"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the dashboard's server components on a timer, so a tab left
 * open keeps showing current numbers (each widget's own sync throttles how
 * often that actually reaches Shopify, Plaid or Yahoo). Client state —
 * scroll position, an expanded tile — survives a router.refresh().
 *
 * Skips while the tab is hidden, and catches up as soon as it's shown again.
 */
export function AutoRefresh({ everyMs = 2 * 60 * 1000 }: { everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < everyMs) return;
      last = Date.now();
      router.refresh();
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, everyMs]);

  return null;
}
