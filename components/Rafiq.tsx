"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type Anthropic from "@anthropic-ai/sdk";
import type { PendingAction, TurnResult } from "@/lib/rafiq/agent";
import { openPlans } from "./PlanModal";

type Msg = Anthropic.Beta.BetaMessageParam;

const OPEN_EVENT = "pillar:rafiq-open";

const STARTERS = (muslim: boolean) => [
  "How's my day looking?",
  muslim ? "I just prayed Asr" : "I just finished my workout",
  "What should I focus on this week?",
];

/** What a read tool looks like in the transcript: a quiet "checked X" chip. */
const TOOL_LABELS: Record<string, string> = {
  get_prayer_status: "prayers",
  get_memorization_status: "hifz",
  get_quran_reading: "Qur'an reading",
  get_habit_status: "habits",
  get_goals: "goals",
  get_body_status: "body",
  get_training: "training",
  get_weekly_review: "your week",
  get_routines: "routines",
  get_daily_quote: "reflection",
};

/** The header pill. Lives in the server-rendered nav, so it talks to the panel by event. */
export function openRafiq() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function RafiqButton() {
  return (
    <button
      type="button"
      className="pill pill-highlight inline-flex items-center gap-1.5"
      onClick={openRafiq}
    >
      <span className="rafiq-dot" aria-hidden />
      Rafiq
    </button>
  );
}

/**
 * `enabled` is false on the Free plan: the panel still opens, but it explains
 * Rafiq is part of Pro instead of offering a chat box that would fail.
 */
export function RafiqPanel({ enabled = true, muslim = true }: { enabled?: boolean; muslim?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, busy]);

  async function call(history: Msg[], approvals?: Record<string, boolean>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rafiq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, approvals }),
      });
      const data = (await res.json()) as TurnResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setMessages(data.messages);
      setPending(data.pending);
      setDecisions({});
      if (data.stop === "refusal") setError("Rafiq can't help with that one.");
      if (data.wrote) router.refresh();
    } catch {
      setError("Couldn't reach Rafiq. Is the dev server running?");
    } finally {
      setBusy(false);
    }
  }

  function send(text: string) {
    const t = text.trim();
    if (!t || busy || pending.length > 0) return;
    setDraft("");
    const next: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(next);
    void call(next);
  }

  function decide(id: string, yes: boolean) {
    const next = { ...decisions, [id]: yes };
    setDecisions(next);
    if (pending.every((p) => p.id in next)) void call(messages, next);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(draft);
  }

  return (
    <>
      {/* Floating launcher for phones, where the header pill scrolls away. */}
      <button
        type="button"
        aria-label="Open Rafiq"
        onClick={() => setOpen(true)}
        className={`rafiq-fab fixed bottom-5 right-5 z-40 md:hidden ${open ? "pointer-events-none opacity-0" : ""}`}
      >
        <span className="rafiq-dot" aria-hidden />
      </button>

      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-label="Rafiq"
        aria-hidden={!open}
        inert={!open}
        className={`rafiq-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col ${open ? "is-open" : ""}`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rafiq-avatar" aria-hidden>
              ر
            </span>
            <div>
              <div className="text-base font-semibold leading-tight">
                <span className="grad-text">Rafiq</span>
              </div>
              <div className="text-xs text-muted">{muslim ? "your deen buddy" : "your companion"}</div>
            </div>
          </div>
          <button type="button" className="pill pill-inactive" onClick={() => setOpen(false)}>
            Close
          </button>
        </header>

        <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
          {!enabled && (
            <div className="rafiq-in space-y-4">
              <p className="text-sm leading-relaxed text-muted">
                {muslim ? "Assalamu alaykum. " : "Hey. "}I&apos;m Rafiq, your companion. I can read across your widgets, tell
                you how your week is really going, log things when you tell me, and rearrange your dashboard. I&apos;m part
                of the Pro plan.
              </p>
              <button type="button" className="pill pill-highlight" onClick={openPlans}>
                See plans
              </button>
            </div>
          )}

          {enabled && messages.length === 0 && (
            <div className="rafiq-in space-y-4">
              <p className="text-sm leading-relaxed text-muted">
                {muslim ? "Assalamu alaykum. " : "Hey. "}I can see the widgets on your dashboard. Ask how you&apos;re doing, or tell
                me what you&apos;ve done and I&apos;ll log it once you say yes.
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTERS(muslim).map((s) => (
                  <button key={s} type="button" className="rafiq-chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <Turn key={i} message={m} />
          ))}

          {pending.length > 0 && !busy && (
            <div className="rafiq-in space-y-2">
              {pending.map((p) => (
                <div key={p.id} className="rafiq-confirm">
                  <span className="text-sm">{p.label}?</span>
                  <span className="flex shrink-0 gap-1.5">
                    {p.id in decisions ? (
                      <span className="text-xs text-muted">{decisions[p.id] ? "Yes" : "Skipped"}</span>
                    ) : (
                      <>
                        <button type="button" className="rafiq-yes" onClick={() => decide(p.id, true)}>
                          Yes
                        </button>
                        <button type="button" className="rafiq-no" onClick={() => decide(p.id, false)}>
                          Not now
                        </button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {busy && (
            <div className="rafiq-typing" aria-label="Rafiq is thinking">
              <span />
              <span />
              <span />
            </div>
          )}

          {error && <p className="rafiq-in rounded-[10px] border border-bad/40 px-3 py-2 text-sm text-bad">{error}</p>}
        </div>

        {enabled && (
          <form onSubmit={onSubmit} className="border-t border-line-soft p-4">
            <div className="rafiq-input">
              <textarea
                ref={input}
                rows={1}
                value={draft}
                placeholder={pending.length > 0 ? "Answer the question above first" : "Message Rafiq"}
                disabled={pending.length > 0}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-faint"
              />
              <button type="submit" className="rafiq-send" disabled={busy || !draft.trim() || pending.length > 0}>
                Send
              </button>
            </div>
            <p className="mt-2 text-[0.68rem] text-faint">
              Rafiq isn&apos;t a scholar. For rulings, ask someone qualified.
            </p>
          </form>
        )}
      </aside>
    </>
  );
}

/** One transcript entry. Tool results and thinking are plumbing, so they don't render. */
function Turn({ message }: { message: Msg }) {
  if (message.role === "user") {
    if (typeof message.content !== "string") return null;
    return (
      <div className="rafiq-in flex justify-end">
        <div className="rafiq-bubble-user">{message.content}</div>
      </div>
    );
  }

  const blocks = typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : message.content;
  const checked = blocks.flatMap((b) => (b.type === "tool_use" && TOOL_LABELS[b.name] ? [TOOL_LABELS[b.name]] : []));
  const text = blocks
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n\n")
    .trim();

  return (
    <div className="rafiq-in space-y-2">
      {checked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {checked.map((c, i) => (
            <span key={i} className="rafiq-tool">
              checked {c}
            </span>
          ))}
        </div>
      )}
      {text && <div className="rafiq-bubble whitespace-pre-wrap">{text}</div>}
    </div>
  );
}
