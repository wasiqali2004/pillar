import Link from "next/link";
import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { BILLING_LIVE, PLANS, RAFIQ_MONTHLY_MESSAGES, perDay } from "@/lib/dashboard/catalog";
import { Mark } from "@/components/Mark";
import { InstallButton } from "@/components/InstallButton";
import { WidgetGlyph } from "@/components/onboarding/WidgetGlyph";
import { HeroMock } from "@/components/site/HeroMock";
import { Reveal, SpotlightGrid } from "@/components/site/Interactive";
import type { WidgetId } from "@/lib/dashboard/catalog";

/**
 * The public website. The app itself lives at /app (and /welcome for setup);
 * installing it opens straight to /app. Everything here is static copy, so
 * claims stay honest: no user counts, no ratings, billing marked as beta.
 */
export const metadata: Metadata = { title: { absolute: `${BRAND.name}: ${BRAND.tagline}` } };

const FEATURES: { id: WidgetId; title: string; text: string; tier: string }[] = [
  { id: "prayers", title: "Prayer times", text: "The five daily prayers for your city. Tap to log, keep your streak.", tier: "Free" },
  { id: "quran", title: "Qur'an", text: "Track the surahs you're memorizing and pick up reading where you stopped.", tier: "Free" },
  { id: "training", title: "Training", text: "Workouts, PRs, a push/pull/legs calendar and a 3D muscle map.", tier: "Free" },
  { id: "habits", title: "Habits & goals", text: "A daily checklist with streaks, and monthly goals that fill up on their own.", tier: "Free" },
  { id: "portfolio", title: "Money & investing", text: "Spending this month, and your portfolio from one day to all time.", tier: "Free" },
  { id: "business", title: "Business revenue", text: "Shopify, or other apps you use to record sales. See them without leaving your dashboard.", tier: "Free" },
];

/** What everyone gets while it's free: the free plan, plus what Pro will be. */
const EVERYTHING = [
  ...PLANS[0].features.map((f) => f.text),
  `Rafiq, your AI companion (${RAFIQ_MONTHLY_MESSAGES} messages a month)`,
  "The Prayer Tree: watch every prayer grow",
  "Reminders for prayer times and an evening check-in",
];

const STEPS = [
  { n: "1", title: "Answer a couple of questions", text: "Make an account, then tell us what you want to focus on. We build your dashboard from there." },
  { n: "2", title: "Make it yours", text: "Every tracker is free. Add, remove, drag and resize widgets whenever you like." },
  { n: "3", title: "Stay steady", text: "Open it every day. Rafiq checks in, connects the dots and logs things when you say so." },
];

export default function Home() {
  return (
    <div className="lp">
      <div className="lp-glow" aria-hidden />

      {/* ── nav ─────────────────────────────────────────── */}
      <header className="lp-nav">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark className="h-8 w-8" gradientId="nav-mark" />
          <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex" aria-label="Sections">
          <a href="#features" className="lp-link">Features</a>
          <a href="#rafiq" className="lp-link">Rafiq</a>
          <a href="#plans" className="lp-link">{BILLING_LIVE ? "Plans" : "Price"}</a>
          <a href="#app" className="lp-link">Get the app</a>
        </nav>
        <div className="flex items-center gap-2">
          <InstallButton className="lp-ghost hidden sm:inline-flex" />
          <Link href="/login" className="lp-ghost hidden sm:inline-flex">
            Sign in
          </Link>
          <Link href="/signup" className="pill pill-highlight">
            Get started
          </Link>
        </div>
      </header>

      {/* ── hero ────────────────────────────────────────── */}
      <section className="lp-section grid items-center gap-12 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div className="lp-hero-copy">
          <p className="lp-kicker">
            What holds your day up
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Stay steady.
            <br />
            <span className="grad-text">Every day.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Your habits, training, health and money on one screen, plus prayer times and Qur&apos;an if you want them, with
            Rafiq, an AI companion who helps you keep going when motivation runs out.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="ob-next">
              Get started free
            </Link>
            <a href="#how" className="lp-ghost lp-ghost-lg">
              See how it works
            </a>
          </div>
          <p className="mt-5 text-xs text-faint">Free for now · No card needed · Works on desktop and phone</p>
        </div>
        <HeroMock />
      </section>

      {/* ── features ───────────────────────────────────── */}
      <section id="features" className="lp-section">
        <Reveal>
          <p className="lp-kicker">Features</p>
          <h2 className="lp-h2">Everything you track, finally in one place</h2>
          <p className="lp-sub">
            Most people juggle a gym app, a habit tracker, a budget sheet and, for many, a prayer app. None of them talk to each other.
          </p>
        </Reveal>
        <SpotlightGrid className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.id}>
              <article data-spot className="lp-card" style={{ transitionDelay: `${i * 60}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <span className="ob-widget-art">
                    <WidgetGlyph id={f.id} className="h-12 w-20" />
                  </span>
                  <span className={f.tier === "Free" ? "ob-badge" : "tier-badge"}>{f.tier}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
              </article>
            </Reveal>
          ))}
        </SpotlightGrid>
      </section>

      {/* ── for everyone ───────────────────────────────── */}
      <section className="lp-section">
        <Reveal className="grid gap-5 md:grid-cols-2">
          <div className="lp-panel">
            <p className="lp-kicker">If you&apos;re Muslim</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">Built around your salah</h3>
            <ul className="lp-list mt-5">
              <li>Prayer times for your city, with a streak that rewards consistency</li>
              <li>Qur&apos;an memorization and a reader that only shows sourced text</li>
              <li>Rafiq won&apos;t give rulings and points you to a scholar for fiqh</li>
            </ul>
          </div>
          <div className="lp-panel">
            <p className="lp-kicker">If you&apos;re not</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">Still built for you</h3>
            <ul className="lp-list mt-5">
              <li>Setup asks, then leaves prayer features out of your suggestions</li>
              <li>Habits, training, goals and money work exactly the same</li>
              <li>Rafiq follows your lead and keeps it about your goals</li>
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ── rafiq ──────────────────────────────────────── */}
      <section id="rafiq" className="lp-section grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <p className="lp-kicker">Meet Rafiq</p>
          <h2 className="lp-h2">A companion that sees the whole picture</h2>
          <p className="lp-sub">
            Rafiq means companion. He reads across your widgets, so he can tell you things no single app can, like how your
            prayers hold up on training days.
          </p>
          <ul className="lp-list mt-6">
            <li>Never logs anything until you tap Yes</li>
            <li>Only sees the widgets you chose to show</li>
            <li>Can rearrange your dashboard when you ask</li>
            <li>Encourages, never shames</li>
          </ul>
        </Reveal>
        <Reveal>
          <div className="lp-chat" aria-label="Example conversation with Rafiq">
            <div className="lp-chat-head">
              <span className="rafiq-avatar">ر</span>
              <span>
                <b className="block text-sm">Rafiq</b>
                <span className="text-xs text-muted">your companion</span>
              </span>
            </div>
            <div className="space-y-3 p-5">
              <div className="lp-msg lp-msg-user" style={{ ["--i" as string]: 0 }}>
                I just prayed Asr and finished leg day
              </div>
              <div className="lp-msg lp-msg-bot" style={{ ["--i" as string]: 1 }}>
                Nice work. That&apos;s three of five today, and you&apos;ve hit every prayer on a training day this week. Want me
                to log both?
              </div>
              <div className="lp-msg lp-confirm" style={{ ["--i" as string]: 2 }}>
                <span>Log Asr as prayed today?</span>
                <span className="rafiq-yes">Yes</span>
              </div>
              <div className="lp-msg lp-msg-bot" style={{ ["--i" as string]: 3 }}>
                Done. Maghrib is at 6:36.
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── how it works ───────────────────────────────── */}
      <section id="how" className="lp-section">
        <Reveal>
          <p className="lp-kicker">How it works</p>
          <h2 className="lp-h2">Set up in about a minute</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <Reveal key={s.n}>
              <div className="lp-step">
                <span className="lp-step-n">{s.n}</span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {BILLING_LIVE ? (
        <>
      <section id="plans" className="lp-section">
        <Reveal>
          <p className="lp-kicker">Plans</p>
          <h2 className="lp-h2">Start free. Upgrade when it&apos;s worth it.</h2>
          <p className="lp-sub">Paid plans are free while {BRAND.name} is in beta. Nobody is charged yet.</p>
        </Reveal>
        <SpotlightGrid className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
          {PLANS.map((p) => (
            <Reveal key={p.id}>
              <article data-spot className={`lp-card lp-plan ${p.id === "pro" ? "is-featured" : ""}`}>
                {p.id === "pro" && <span className="plan-ribbon">Most popular</span>}
                <h3 className="text-xl font-semibold">{p.name}</h3>
                <p className="text-xs text-muted">{p.tagline}</p>
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="plan-price">{p.monthly === 0 ? "$0" : perDay(p.monthly)}</span>
                  <span className="text-xs text-muted">{p.monthly === 0 ? "forever" : "per day"}</span>
                </p>
                {p.monthly > 0 && <p className="text-sm text-teal">${p.monthly.toFixed(2)} monthly</p>}
                {p.yearly !== null && <p className="text-xs text-faint">or ${p.yearly.toFixed(2)} a year</p>}
                <ul className="mt-5 space-y-2 text-sm">
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
                <Link href="/signup" className={`mt-6 ${p.id === "pro" ? "ob-next text-center" : "lp-ghost lp-ghost-lg justify-center"}`}>
                  {p.id === "free" ? "Start free" : `Start with ${p.name}`}
                </Link>
              </article>
            </Reveal>
          ))}
        </SpotlightGrid>
      </section>
        </>
      ) : (
        <section id="plans" className="lp-section">
          <Reveal>
            <p className="lp-kicker">Price</p>
            <h2 className="lp-h2">Free while {BRAND.name} is new.</h2>
            <p className="lp-sub">
              No card and no trial that runs out. If paid plans ever arrive, you&apos;ll be told before you&apos;re asked to pay for
              anything.
            </p>
          </Reveal>
          <Reveal>
            <article className="lp-card lp-plan mx-auto mt-10 max-w-xl">
              <ul className="space-y-2 text-sm">
                {EVERYTHING.map((text) => (
                  <li key={text} className="flex gap-2">
                    <span className="plan-tick" aria-hidden>
                      ✓
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup" className="ob-next mt-6 text-center">
                Get started free
              </Link>
            </article>
          </Reveal>
        </section>
      )}

      {/* ── privacy ────────────────────────────────────── */}
      <section className="lp-section">
        <Reveal className="lp-panel lp-privacy">
          <svg viewBox="0 0 24 24" className="h-10 w-10 shrink-0" aria-hidden>
            <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" fill="none" stroke="var(--color-teal)" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="var(--color-violet)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <h3 className="text-xl font-semibold">Your data is yours. We never sell it.</h3>
            <p className="mt-1 text-sm text-muted">
              Every account has its own private database. You can download or delete everything in one tap. Widgets you leave off
              never load and never sync, and Rafiq can only read what you chose to show.{" "}
              <Link href="/privacy" className="text-teal hover:underline">
                Read how it works
              </Link>
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── get the app ────────────────────────────────── */}
      <section id="app" className="lp-section">
        <Reveal className="lp-panel lp-app">
          <Mark className="lp-app-mark" gradientId="app-mark" />
          <div className="flex-1">
            <p className="lp-kicker">Get the app</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Use it in your browser, or install it</h2>
            <p className="mt-3 max-w-xl text-muted">
              Install {BRAND.name} and it opens in its own window on your desktop, or from your home screen on your phone.
              App Store and Google Play versions are on the roadmap.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <InstallButton
                className="ob-next"
                label={`Install ${BRAND.name}`}
                fallback={
                  <span className="text-sm text-muted">
                    In Chrome or Edge, use the install icon in the address bar. On iPhone, tap Share then Add to Home Screen.
                  </span>
                }
              />
              <Link href="/signup" className="lp-ghost lp-ghost-lg">
                Open in browser
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="lp-section lp-footer">
        <span className="flex items-center gap-2">
          <Mark className="h-6 w-6" gradientId="foot-mark" />
          <span className="font-semibold">{BRAND.name}</span>
          <span className="text-faint">· {BRAND.tagline}</span>
        </span>
        <span className="text-xs text-faint">
          © {new Date().getFullYear()} {BRAND.name}. Rafiq isn&apos;t a scholar; for rulings, ask someone qualified.{" "}
          <Link href="/privacy" className="underline hover:text-muted">Privacy</Link> ·{" "}
          <Link href="/terms" className="underline hover:text-muted">Terms</Link>
        </span>
      </footer>
    </div>
  );
}
