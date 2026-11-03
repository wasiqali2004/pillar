"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PLANS, perDay, type PlanId } from "@/lib/dashboard/catalog";
import { setPlanAction } from "@/lib/dashboard/actions";

const OPEN_EVENT = "pillar:plans-open";

/** Anything on the page can ask for the plans popup (a locked tile, Rafiq). */
export function openPlans() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const money = (n: number) => (n === 0 ? "$0" : `$${n.toFixed(2)}`);

/**
 * Free / Pro. Shown at the end of setup, before the dashboard, and from the
 * plan pill in the header afterwards. Every tracker is free, so the choice is
 * only about the AI and the visual progress on top.
 */
export function PlanModal({
  open,
  current,
  busy,
  confirmLabel,
  onChoose,
  onClose,
}: {
  open: boolean;
  current: PlanId | null;
  busy?: boolean;
  confirmLabel?: (plan: PlanId) => string;
  onChoose: (plan: PlanId) => void;
  onClose: () => void;
}) {
  const [yearly, setYearly] = useState(false);
  const [selected, setSelected] = useState<PlanId>(current ?? "pro");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pro = PLANS.find((p) => p.id === "pro")!;
  const yearlySaving = Math.round((1 - pro.yearly! / (pro.monthly * 12)) * 100);

  return (
    <div className="plan-overlay" role="dialog" aria-modal="true" aria-label="Choose your plan">
      <button type="button" className="plan-scrim" aria-label="Close" onClick={onClose} />
      <div className="plan-sheet">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-teal uppercase">One last thing</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Choose your plan</h2>
            <p className="mt-1 text-sm text-muted">Start free and upgrade whenever you like. You can switch plans any time.</p>
          </div>
          <div className="plan-toggle" role="group" aria-label="Billing period">
            <span className="plan-toggle-thumb" style={{ transform: yearly ? "translateX(100%)" : "none" }} aria-hidden />
            <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>
              Monthly
            </button>
            <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>
              Yearly <span className="text-teal">−{yearlySaving}%</span>
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {PLANS.map((p, i) => {
            const price = yearly && p.yearly !== null ? p.yearly : p.monthly;
            const isSel = selected === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                aria-pressed={isSel}
                className={`plan-card ${isSel ? "is-on" : ""} ${p.id === "pro" ? "is-featured" : ""}`}
                style={{ animationDelay: `${80 + i * 90}ms` }}
              >
                {p.id === "pro" && <span className="plan-ribbon">Most popular</span>}
                <span className="flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold">{p.name}</span>
                  {current === p.id && <span className="ob-badge">Current</span>}
                </span>
                <span className="text-xs text-muted">{p.tagline}</span>
                {p.monthly === 0 ? (
                  <span className="mt-3 flex items-baseline gap-1.5">
                    <span className="plan-price">$0</span>
                    <span className="text-xs text-muted">forever</span>
                  </span>
                ) : (
                  <>
                    <span className="mt-3 flex items-baseline gap-1.5">
                      <span key={`${p.id}-${yearly}`} className="plan-price">
                        {perDay(price, yearly && p.yearly !== null)}
                      </span>
                      <span className="text-xs text-muted">per day</span>
                    </span>
                    <span className={`text-sm ${!yearly || p.yearly === null ? "text-teal" : "text-muted"}`}>
                      {money(p.monthly)} monthly
                    </span>
                    {p.yearly !== null && (
                      <span className={`text-xs ${yearly ? "text-teal" : "text-faint"}`}>or {money(p.yearly)} a year</span>
                    )}
                    {yearly && p.yearly === null && <span className="text-[0.68rem] text-faint">Monthly billing only</span>}
                  </>
                )}

                <ul className="mt-4 space-y-2 text-left text-sm">
                  {p.features.map((f) => (
                    <li key={f.text} className="flex gap-2">
                      <span className="plan-tick" aria-hidden>
                        ✓
                      </span>
                      <span>
                        {f.text}
                        {f.soon && <span className="ob-badge ml-2">Soon</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-xs text-faint">
            Billing isn&apos;t switched on yet. Pro is free while Pillar is in beta; nobody is charged.
          </p>
          <span className="flex gap-2">
            <button type="button" className="pill pill-inactive" onClick={onClose} disabled={busy}>
              Not now
            </button>
            <button type="button" className="ob-next" onClick={() => onChoose(selected)} disabled={busy}>
              {busy ? "Saving…" : (confirmLabel?.(selected) ?? `Continue with ${PLANS.find((p) => p.id === selected)!.name}`)}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** A button that opens the plans popup: "Go Pro" on the dashboard, "Manage plan" on the Pro page. */
export function PlanButton({ plan, label, className = "pill" }: { plan: PlanId; label: string; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <PlanModal
        open={open}
        current={plan}
        busy={busy}
        confirmLabel={(p) => (p === plan ? "Keep this plan" : `Switch to ${PLANS.find((x) => x.id === p)!.name}`)}
        onClose={() => setOpen(false)}
        onChoose={(p) =>
          start(async () => {
            await setPlanAction(p);
            setOpen(false);
            router.refresh();
          })
        }
      />
    </>
  );
}
