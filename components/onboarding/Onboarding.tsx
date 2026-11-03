"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CATALOG,
  CATALOG_BY_ID,
  CATEGORY_LABELS,
  BILLING_LIVE,
  EMPTY_ANSWERS,
  INTENTION_MAX,
  placeWidget,
  recommend,
  tidy,
  type Answers,
  type Category,
  type LayoutItem,
  type PlanId,
  type WidgetId,
} from "@/lib/dashboard/catalog";
import { completeOnboardingAction } from "@/lib/dashboard/actions";
import { PlanModal } from "@/components/PlanModal";
import { WidgetGlyph } from "./WidgetGlyph";
import { Mark } from "@/components/Mark";
import { PrayerSetup } from "@/components/settings/PrayerSetup";
import type { PrayerSettings } from "@/lib/prayer-options";

/* ── the questions ──────────────────────────────────────────────
   Two questions, then the dashboard they produce. Everything else (sizes,
   order, more widgets) is one tap away in Customize, so it isn't asked here. */

type Option = { value: string; title: string; sub?: string; muslimOnly?: boolean };
type Question = {
  key: "faith" | "why";
  /** Adds an optional "in your own words" box under the options. */
  freeText?: boolean;
  kicker: string;
  title: string;
  hint: string;
  multi: boolean;
  options: Option[];
};

const QUESTIONS: Question[] = [
  {
    key: "faith",
    kicker: "Welcome",
    title: "First things first: are you Muslim?",
    hint: "Everyone gets every tracker. Muslims also get prayer times and Qur'an.",
    multi: false,
    options: [
      { value: "muslim", title: "Yes, I'm Muslim", sub: "Prayer times and Qur'an go on your dashboard" },
      { value: "other", title: "No, I'm not", sub: "Habits, training, money and goals" },
      { value: "unsaid", title: "I'd rather not say", sub: "No problem. You choose what goes on" },
    ],
  },
  {
    key: "why",
    kicker: "Your focus",
    title: "What do you want to focus on?",
    hint: "Pick any. We'll build your dashboard from it. Skip it and you get everything.",
    multi: true,
    freeText: true,
    options: [
      { value: "deen", title: "My salah and Qur'an", sub: "Fewer missed prayers, more Qur'an", muslimOnly: true },
      { value: "fitness", title: "Training", sub: "Workouts, PRs and a muscle map" },
      { value: "health", title: "Health", sub: "Steps, sleep and weight" },
      { value: "habits", title: "Better habits", sub: "Small things, every day, with streaks" },
      { value: "focus", title: "Hitting my goals", sub: "Monthly targets that fill up on their own" },
      { value: "mind", title: "A calmer mind", sub: "One short reflection to sit with" },
      { value: "money", title: "My money", sub: "Spending, saving and investing" },
      { value: "business", title: "My business", sub: "Sales from Shopify or other apps" },
    ],
  },
];

type Step = "splash" | "q:faith" | "place" | "q:why" | "pick";

/** How long the opening animation plays before the first question. */
const SPLASH_MS = 1400;

export function Onboarding({
  initialAnswers,
  initialLayout,
  initialPrayer,
}: {
  initialAnswers: Answers | null;
  initialLayout: LayoutItem[] | null;
  initialPrayer: PrayerSettings | null;
}) {
  const router = useRouter();
  const redo = initialLayout !== null;
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<Answers>(initialAnswers ?? EMPTY_ANSWERS);
  const [items, setItems] = useState<LayoutItem[]>(initialLayout ?? []);
  // Once someone has hand-picked, changing an answer doesn't overwrite it.
  const [picked, setPicked] = useState(redo);
  const [finishing, startFinish] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [prayer, setPrayer] = useState<PrayerSettings | null>(initialPrayer);

  // Prayer times only matter to someone who asked for them.
  const STEPS: Step[] =
    answers.faith === "muslim" ? ["splash", "q:faith", "place", "q:why", "pick"] : ["splash", "q:faith", "q:why", "pick"];
  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const recommended = useMemo(() => new Set(recommend(answers)), [answers]);

  function go(delta: 1 | -1) {
    const nextIndex = Math.max(0, Math.min(STEPS.length - 1, index + delta));
    const next = STEPS[nextIndex];
    if (delta === 1 && next === "pick") {
      if (!picked) setItems(tidy(recommend(answers)));
      // A kept layout can still hold prayer widgets, and the pick step hides
      // that section from someone who said they aren't Muslim.
      else if (answers.faith === "other") setItems((prev) => prev.filter((i) => CATALOG_BY_ID.get(i.id)?.category !== "deen"));
    }
    setDir(delta);
    setIndex(nextIndex);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // The opening animation hands over to the first question on its own.
  useEffect(() => {
    if (step !== "splash") return;
    const t = window.setTimeout(() => {
      setDir(1);
      setIndex(1);
    }, SPLASH_MS);
    return () => window.clearTimeout(t);
  }, [step]);

  function finish(plan: PlanId) {
    setError(null);
    startFinish(async () => {
      try {
        await completeOnboardingAction(answers, items, plan, prayer);
      } catch {
        setError("Couldn't save your dashboard. Try again.");
        return;
      }
      router.replace("/app/connect?welcome=1");
    });
  }

  // Enter moves forward on the question screens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && step.startsWith("q:") && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLTextAreaElement)) go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const progress = index / (STEPS.length - 1);

  if (step === "splash") return <Splash onSkip={() => go(1)} />;

  return (
    <main className="ob-shell">
      <div className="ob-glow" aria-hidden />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 pt-6 sm:px-8">
        <span className="text-lg font-semibold tracking-tight">
          <span className="grad-text">Pillar</span>
        </span>
        {redo && (
          <Link href="/app" className="pill pill-inactive">
            Back to dashboard
          </Link>
        )}
      </header>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5 pt-5 sm:px-8">
        <div className="ob-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      </div>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-8 pt-10 sm:px-8">
        <div key={step} className={dir === 1 ? "ob-enter-fwd" : "ob-enter-back"}>
          {step.startsWith("q:") && (
            <QuestionStep
              q={QUESTIONS.find((q) => `q:${q.key}` === step)!}
              answers={answers}
              onChange={setAnswers}
              onPicked={() => window.setTimeout(() => go(1), 260)}
            />
          )}

          {step === "place" && (
            <div className="mx-auto max-w-3xl">
              <p className="text-xs font-semibold tracking-[0.2em] text-teal uppercase">Prayer times</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Where do you pray?</h2>
              <p className="mt-2 text-sm text-muted">So your times are right for your city. You can change this any time, or skip it for now.</p>
              <div className="mt-8">
                <PrayerSetup value={prayer} onChange={setPrayer} />
              </div>
            </div>
          )}

          {step === "pick" && (
            <PickStep
              items={items}
              recommended={recommended}
              hideDeen={answers.faith === "other"}
              onChange={(next) => {
                setPicked(true);
                setItems(next);
              }}
              onUseRecommended={() => {
                setPicked(true);
                setItems(tidy(recommend(answers)));
              }}
            />
          )}

        </div>

        <nav className="mt-auto flex items-center justify-between gap-3 pt-10">
          {index > 1 ? (
            <button type="button" className="pill pill-inactive" onClick={() => go(-1)} disabled={finishing}>
              ← Back
            </button>
          ) : (
            <span />
          )}
          <span className="font-mono text-[0.68rem] text-faint">
            {index} / {STEPS.length - 1}
          </span>
          {step === "pick" ? (
            <button type="button" className="ob-next" onClick={() => (BILLING_LIVE ? setPlansOpen(true) : finish("free"))} disabled={finishing}>
              {finishing ? "Setting up…" : "Looks good →"}
            </button>
          ) : (
            <button type="button" className="ob-next" onClick={() => go(1)}>
              {step === "place" && !prayer ? "Skip for now →" : "Next →"}
            </button>
          )}
        </nav>
        {error && <p className="mt-3 text-right text-sm text-bad">{error}</p>}
      </section>

      {/* Once there are paid plans, the choice comes last, right before the dashboard. */}
      {BILLING_LIVE && (
        <PlanModal
          open={plansOpen}
          current={null}
          busy={finishing}
          confirmLabel={(p) => (p === "free" ? "Start free" : "Start with Pro")}
          onClose={() => setPlansOpen(false)}
          onChoose={finish}
        />
      )}
    </main>
  );
}

/* ── steps ──────────────────────────────────────────────────── */

function Splash({ onSkip }: { onSkip: () => void }) {
  return (
    <main className="ob-shell splash" onClick={onSkip} role="presentation">
      <div className="ob-glow" aria-hidden />
      <div className="relative z-10 m-auto flex flex-col items-center text-center">
        {/* Sunrise over the horizon with an upright pillar. */}
        <Mark className="splash-mark" animated gradientId="splash-grad" />
        <h1 className="splash-word mt-8 text-5xl font-semibold tracking-tight">
          {"Pillar".split("").map((ch, i) => (
            <span key={i} style={{ animationDelay: `${450 + i * 45}ms` }}>
              {ch}
            </span>
          ))}
        </h1>
        <p className="splash-sub mt-4 text-sm text-muted">Stay steady. Every day.</p>
        <span className="splash-bar mt-10" aria-hidden>
          <span />
        </span>
      </div>
    </main>
  );
}

function QuestionStep({
  q,
  answers,
  onChange,
  onPicked,
}: {
  q: Question;
  answers: Answers;
  /** Takes an updater so two changes in one tick both land. */
  onChange: (update: (prev: Answers) => Answers) => void;
  /** A single-choice answer moves straight on; no Next tap needed. */
  onPicked: () => void;
}) {
  const current = answers[q.key];
  const isOn = (v: string) => (Array.isArray(current) ? (current as string[]).includes(v) : current === v);
  const visible = (o: Option) => !o.muslimOnly || answers.faith !== "other";

  function toggle(o: Option) {
    if (!q.multi) {
      onChange((prev) => {
        const next = { ...prev, [q.key]: o.value } as Answers;
        // Not Muslim: drop the salah focus they can no longer see.
        if (q.key === "faith" && next.faith === "other") next.why = next.why.filter((w) => w !== "deen");
        return next;
      });
      onPicked();
      return;
    }
    onChange((prev) => {
      const list = prev.why as string[];
      const next = list.includes(o.value) ? list.filter((v) => v !== o.value) : [...list, o.value];
      return { ...prev, why: next as Answers["why"] };
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.2em] text-teal uppercase">{q.kicker}</p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{q.title}</h2>
      <p className="mt-2 text-sm text-muted">{q.hint}</p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {q.options.filter(visible).map((o, i) => {
          const on = isOn(o.value);
          return (
            <button
              key={o.value}
              type="button"
              role={q.multi ? "checkbox" : "radio"}
              aria-checked={on}
              onClick={() => toggle(o)}
              className={`ob-option ${on ? "is-on" : ""}`}
              style={{ animationDelay: `${60 + i * 55}ms` }}
            >
              <span className={`ob-check ${q.multi ? "" : "is-radio"}`} aria-hidden>
                <svg viewBox="0 0 16 16">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
              </span>
              <span className="flex flex-col gap-1 text-left">
                <span className="font-semibold">{o.title}</span>
                {o.sub && <span className="text-sm text-muted">{o.sub}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {q.freeText && (
        <label className="mt-6 block">
          <span className="text-sm font-semibold">In your own words</span>
          <span className="ml-2 text-xs text-faint">optional · Rafiq will keep it in mind</span>
          <textarea
            value={answers.intention}
            maxLength={INTENTION_MAX}
            rows={3}
            placeholder="e.g. I want to stop missing Fajr and get back to the gym 4 times a week."
            onChange={(e) => {
              const intention = e.target.value;
              onChange((prev) => ({ ...prev, intention }));
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className="ob-textarea mt-2"
          />
          <span className="mt-1 block text-right font-mono text-[0.65rem] text-faint">
            {answers.intention.length}/{INTENTION_MAX}
          </span>
        </label>
      )}
    </div>
  );
}

function PickStep({
  items,
  recommended,
  hideDeen,
  onChange,
  onUseRecommended,
}: {
  items: LayoutItem[];
  recommended: Set<WidgetId>;
  hideDeen: boolean;
  onChange: (next: LayoutItem[]) => void;
  onUseRecommended: () => void;
}) {
  const on = new Set(items.map((i) => i.id));
  const cats = (Object.keys(CATEGORY_LABELS) as Category[]).filter((c) => !hideDeen || c !== "deen");

  function toggle(id: WidgetId) {
    if (on.has(id)) onChange(items.filter((i) => i.id !== id));
    else onChange(placeWidget(items, id));
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-teal uppercase">Your dashboard</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Here&apos;s what we built for you</h2>
          <p className="mt-2 text-sm text-muted">
            Everything here is free. Tap to add or remove; arrange and resize them on your dashboard any time.
          </p>
        </div>
        <button type="button" className="pill pill-inactive" onClick={onUseRecommended}>
          Reset to recommended
        </button>
      </div>

      <div className="mt-8 space-y-8">
        {cats.map((cat) => (
          <div key={cat}>
            <h3 className="mb-3 flex items-center gap-3 text-[0.62rem] font-semibold tracking-[0.18em] text-faint uppercase">
              {CATEGORY_LABELS[cat]}
              <span className="h-px flex-1 bg-line-soft" />
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CATALOG.filter((c) => c.category === cat).map((c, i) => {
                const active = on.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    onClick={() => toggle(c.id)}
                    className={`ob-widget ${active ? "is-on" : ""}`}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <span className="ob-widget-art">
                      <WidgetGlyph id={c.id} className="h-12 w-20" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{c.title}</span>
                        {recommended.has(c.id) && <span className="ob-badge">For you</span>}
                      </span>
                      <span className="text-xs leading-relaxed text-muted">{c.blurb}</span>
                      {c.replaces && (
                        <span className="text-[0.68rem] text-faint">
                          Includes {c.replaces.map((r) => CATALOG_BY_ID.get(r)!.title).join(" + ")}
                        </span>
                      )}
                    </span>
                    <span className="ob-check" aria-hidden>
                      <svg viewBox="0 0 16 16">
                        <path d="M3.5 8.5l3 3 6-7" />
                      </svg>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
