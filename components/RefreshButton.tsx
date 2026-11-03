"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshAllAction } from "@/lib/sync/actions";
import type { RefreshReport } from "@/lib/sync";

/**
 * Forces every external source to re-pull, then re-renders the dashboard.
 *
 * Two steps, and both are needed: the action updates the database, and
 * router.refresh() is what re-runs the server components that read it. The
 * refresh is awaited inside the same transition so `pending` stays true until
 * new numbers are actually on screen, rather than dropping the moment the
 * sync returns and leaving a stale dashboard looking settled.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [report, setReport] = useState<RefreshReport | null>(null);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Dismiss the panel on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go() {
    start(async () => {
      const r = await refreshAllAction();
      setReport(r);
      setOpen(true);
      router.refresh();
    });
  }

  const failed = report?.failed ?? 0;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className={`pill ${failed > 0 ? "border-warn text-warn" : ""}`}
        aria-label="Refresh all data"
        title="Pull the latest from every connected source"
      >
        <span className={pending ? "spin inline-block" : "inline-block"}>⟳</span>
        {pending ? "Syncing…" : "Refresh"}
      </button>

      {open && report && !pending && (
        <div className="refresh-pop" role="status">
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-faint">
              Last refresh
            </span>
            <span className="tnum font-mono text-[0.62rem] text-faint">
              {(report.ms / 1000).toFixed(1)}s
            </span>
          </div>

          <ul className="flex flex-col">
            {report.sources.map((s) => (
              <li
                key={s.id}
                className="flex items-baseline justify-between gap-3 border-b border-line-soft/60 py-1 last:border-0"
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span
                    className={
                      s.status === "ok"
                        ? "text-teal"
                        : s.status === "error"
                          ? "text-bad"
                          : "text-faint"
                    }
                  >
                    {s.status === "ok" ? "●" : s.status === "error" ? "▲" : "○"}
                  </span>
                  <span className="truncate text-xs">{s.label}</span>
                </span>
                <span
                  className={`shrink-0 text-right text-[0.65rem] ${
                    s.status === "error" ? "text-bad" : "text-faint"
                  }`}
                  title={s.detail}
                >
                  {s.detail.length > 34 ? `${s.detail.slice(0, 34)}…` : s.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
