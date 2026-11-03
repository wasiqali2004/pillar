import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getOnboarding, getPlan } from "@/lib/dashboard/prefs";
import { BILLING_LIVE, isPaid } from "@/lib/dashboard/catalog";
import { PlanButton } from "@/components/PlanModal";
import { RafiqButton, RafiqPanel } from "@/components/Rafiq";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pro" };

/** Everything Pro unlocks, in one place. Free users get the plans popup instead. */
export default async function ProHub() {
  const [plan, onboarding] = await Promise.all([getPlan(), getOnboarding()]);
  if (!BILLING_LIVE || !isPaid(plan)) redirect("/app");
  const muslim = onboarding?.answers.faith !== "other";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
      <RafiqPanel enabled muslim={muslim} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-teal uppercase">✦ Pro</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your progress, made visible</h1>
          <p className="mt-1 text-sm text-muted">Rafiq is ready now. The rest are being built and land here first.</p>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/app" className="pill">
            ← Dashboard
          </Link>
          <PlanButton plan={plan} label="Manage plan" />
        </nav>
      </header>

      <section className="mt-8 grid gap-5 md:grid-cols-2">
        <Card
          title="Rafiq"
          tag="Ready"
          text="Your AI companion. Ask about your week, log a prayer or a workout, or have him rearrange your dashboard. He always asks before changing anything."
          art={<RafiqArt />}
          action={<RafiqButton />}
          wide
        />
        {muslim && (
          <Card
            title="The Prayer Tree"
            tag="Ready"
            text="Every prayer grows a leaf. A full day adds a branch, a full week blossoms, a full month bears fruit. Miss one and it waits for you to come back."
            art={<TreeArt />}
            action={
              <Link href="/app/tree" className="pill pill-highlight">
                Open your tree
              </Link>
            }
          />
        )}
        <Card
          title="Strength Mountain"
          text="Your training volume becomes a mountain you climb. Every PR plants a flag on the way up."
          art={<MountainArt />}
        />
        <Card
          title="AI coach"
          text="A plan for your week across prayer, training, habits and money, with a check-in when you start to slip."
          art={<CoachArt />}
        />
        <Card
          title="Accountability partners"
          text="Pair with a friend or two. You see each other's streaks, never the details. Private by default."
          art={<PartnersArt />}
        />
      </section>
    </main>
  );
}

function Card({
  title,
  text,
  art,
  action,
  tag = "Soon",
  wide,
}: {
  title: string;
  text: string;
  art: ReactNode;
  action?: ReactNode;
  tag?: string;
  wide?: boolean;
}) {
  return (
    <article
      className={`flex flex-col gap-4 rounded-[20px] border bg-surface p-5 ${
        wide ? "border-teal/50 sm:flex-row sm:items-center md:col-span-2" : "border-line"
      }`}
    >
      <div
        className={`flex h-32 w-full shrink-0 items-center justify-center rounded-[14px] bg-surface-hi ${wide ? "sm:w-52" : ""}`}
      >
        {art}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <span className="ob-badge">{tag}</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">{text}</p>
        {action && <div className="mt-1">{action}</div>}
      </div>
    </article>
  );
}

const T = "var(--color-teal)";
const V = "var(--color-violet)";
const A = "var(--color-warn)";

function RafiqArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-24 w-36" aria-hidden fill="none">
      <rect x="10" y="12" width="64" height="26" rx="12" fill={V} fillOpacity={0.25} stroke={V} strokeWidth={1.5} />
      <path d="M22 25h40" stroke={V} strokeWidth={2.4} strokeLinecap="round" />
      <rect x="46" y="44" width="64" height="24" rx="12" fill={T} fillOpacity={0.2} stroke={T} strokeWidth={1.5} />
      <path d="M58 56h28" stroke={T} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx="96" cy="56" r="3" fill={A} />
    </svg>
  );
}

function TreeArt() {
  const leaves: [number, number, string][] = [
    [44, 30, T], [56, 22, T], [70, 26, V], [80, 36, T], [38, 42, V], [62, 36, A], [52, 46, T], [74, 46, V], [64, 16, T],
  ];
  return (
    <svg viewBox="0 0 120 80" className="h-24 w-36" aria-hidden fill="none" strokeLinecap="round">
      <path d="M60 76 C60 62 58 52 60 40 M60 56 C52 50 46 46 42 40 M60 48 C68 44 74 40 78 34 M60 40 C58 32 62 26 64 18" stroke={A} strokeWidth={3} />
      {leaves.map(([x, y, c], i) => (
        <ellipse key={i} cx={x} cy={y} rx="7" ry="4.5" fill={c} fillOpacity={0.75} transform={`rotate(${(i * 37) % 70 - 35} ${x} ${y})`} />
      ))}
      <line x1="20" y1="76" x2="100" y2="76" stroke={V} strokeOpacity={0.5} strokeWidth={1.5} />
    </svg>
  );
}

function MountainArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-24 w-36" aria-hidden fill="none" strokeLinejoin="round">
      <path d="M6 74 L40 28 L56 46 L74 16 L114 74 Z" fill={V} fillOpacity={0.22} stroke={V} strokeWidth={1.5} />
      <path d="M66 29 L74 16 L82 29 L77 26 L74 30 L70 26 Z" fill="#e8ecf8" fillOpacity={0.8} />
      <path d="M14 70 Q34 60 44 50 T66 36 T74 18" stroke={T} strokeWidth={1.8} strokeDasharray="3 3" />
      {[
        [44, 50],
        [66, 36],
        [74, 16],
      ].map(([x, y], i) => (
        <g key={i}>
          <line x1={x} y1={y} x2={x} y2={y - 11} stroke={A} strokeWidth={1.4} />
          <path d={`M${x} ${y - 11} l8 3 l-8 3 Z`} fill={A} />
        </g>
      ))}
    </svg>
  );
}

function CoachArt() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <svg viewBox="0 0 120 80" className="h-24 w-36" aria-hidden fill="none">
      {days.map((_, i) => (
        <g key={i}>
          <rect x={10 + i * 15} y="20" width="11" height="40" rx="3" fill={i < 4 ? T : V} fillOpacity={i < 4 ? 0.7 : 0.22} />
          <circle cx={15.5 + i * 15} cy="68" r="2" fill={i === 3 ? A : V} fillOpacity={i === 3 ? 1 : 0.5} />
        </g>
      ))}
    </svg>
  );
}

function PartnersArt() {
  return (
    <svg viewBox="0 0 120 80" className="h-24 w-36" aria-hidden fill="none">
      <circle cx="42" cy="30" r="10" fill={T} fillOpacity={0.6} />
      <path d="M24 66 a18 16 0 0 1 36 0" fill={T} fillOpacity={0.35} />
      <circle cx="78" cy="30" r="10" fill={V} fillOpacity={0.6} />
      <path d="M60 66 a18 16 0 0 1 36 0" fill={V} fillOpacity={0.35} />
      <path d="M56 22 l4 -6 l4 6" stroke={A} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
