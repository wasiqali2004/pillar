import { Suspense } from "react";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { widgetsById } from "@/lib/widgets/registry";
import { loadTraining } from "@/lib/training";
import { loadRoutines } from "@/lib/training/routines";
import { TrainingSection } from "@/lib/training/TrainingSection";
import type { AnyWidget } from "@/lib/widgets/types";
import { localDate, userTz } from "@/lib/date";
import { time } from "@/lib/format";
import { getLayout, getOnboarding, getPlan } from "@/lib/dashboard/prefs";
import { touchActive } from "@/lib/activity";
import { BILLING_LIVE, CATALOG_BY_ID, isPaid } from "@/lib/dashboard/catalog";
import { PlanButton } from "@/components/PlanModal";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ReminderNudge } from "@/components/ReminderNudge";
import { RefreshButton } from "@/components/RefreshButton";
import { DashboardGrid, CustomizeButton, type DashItem } from "@/components/DashboardGrid";
import { RafiqButton, RafiqPanel } from "@/components/Rafiq";

/**
 * Widget loads hit the database (and, for the portfolio, a price feed) rather
 * than going through fetch(), so Next has no cache signal to key off and will
 * happily prerender this page at build time. Without this the deployed
 * dashboard serves build-time data forever.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const [layout, plan, onboarding] = await Promise.all([getLayout(), getPlan(), getOnboarding(), touchActive()]);
  // No saved layout means they haven't been through setup yet.
  if (!layout) redirect("/welcome");

  const today = new Date(`${localDate()}T12:00:00Z`).toLocaleDateString(
    "en-CA",
    { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" },
  );

  // Only what's on the layout is rendered, so a widget the user left off
  // never loads, and never calls out to its data source.
  const items: DashItem[] = layout.flatMap((item): DashItem[] => {
    const title = CATALOG_BY_ID.get(item.id)!.title;
    if (item.id === "training") {
      return [
        {
          ...item,
          title,
          node: (
            <Suspense fallback={<TileSkeleton title={title} />}>
              <TrainingMount />
            </Suspense>
          ),
        },
      ];
    }
    const widget = widgetsById[item.id];
    return widget ? [{ ...item, title, node: <Mount widget={widget} /> }] : [];
  });

  return (
    <main className="mx-auto flex w-full max-w-[1800px] flex-col px-5 py-6 sm:px-7 xl:px-8 xl:py-5">
      <AutoRefresh />
      <ReminderNudge muslim={onboarding?.answers.faith !== "other"} />
      <RafiqPanel enabled={isPaid(plan)} muslim={onboarding?.answers.faith !== "other"} />
      <DashboardGrid
        items={items}
        header={
          <header className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                <span className="grad-text">Pillar</span>
              </h1>
              <p className="mt-0.5 text-sm text-muted">{today}</p>
            </div>

            <nav className="flex flex-wrap items-center gap-2" aria-label="Sections">
              <RefreshButton />
              {BILLING_LIVE &&
                (isPaid(plan) ? (
                  <Link href="/app/pro" className="pill pill-highlight">
                    ✦ Pro
                  </Link>
                ) : (
                  <PlanButton plan={plan} label="Go Pro" className="pill pill-inactive" />
                ))}
              <Link href="/app/review" className="pill">
                <span className="inline-block">◷</span>
                Week
              </Link>
              <Link href="/app/connect" className="pill">
                <span className="inline-block">⇄</span>
                Connect
              </Link>
              <CustomizeButton />
              <Link href="/app/settings" className="pill" aria-label="Settings" title="Settings">
                <span aria-hidden>⚙</span>
              </Link>
              <RafiqButton />
            </nav>
          </header>
        }
        footer={
          <footer className="mt-4 flex shrink-0 items-center justify-between gap-4 font-mono text-[0.68rem] text-faint">
            <span>
              updated {time(new Date())} · day rolls over 4am · {userTz()}
            </span>
            {layout.some((i) => i.id === "training") && (
              <a href="#training" className="hover:text-teal">
                Training ↓
              </a>
            )}
          </footer>
        }
      />
    </main>
  );
}

function Mount({ widget }: { widget: AnyWidget }) {
  return (
    <Suspense fallback={<TileSkeleton title={widget.title} />}>
      <WidgetHost widget={widget} />
    </Suspense>
  );
}

async function TrainingMount() {
  const [data, routines] = await Promise.all([loadTraining(), loadRoutines()]);
  return <TrainingSection initial={data} routines={routines} />;
}

async function WidgetHost({ widget }: { widget: AnyWidget }) {
  // One broken source (a price feed down, an expired token) must only cost its
  // own tile. Without this it takes the whole dashboard with it.
  let data: unknown;
  try {
    data = await widget.load();
  } catch (e) {
    unstable_rethrow(e);
    console.error(`[pillar] ${widget.id} failed to load:`, e instanceof Error ? e.message : e);
    return (
      <div className="tile-3d">
        <div className="tile">
          <div className="tile-title">{widget.title}</div>
          <p className="mt-3 text-sm text-muted">This couldn&apos;t load just now. It will try again on its own.</p>
        </div>
      </div>
    );
  }
  const Tile = widget.Tile;
  return <Tile data={data} />;
}

function TileSkeleton({ title }: { title: string }) {
  return (
    <div className="tile-3d">
      <div className="tile animate-pulse">
        <div className="tile-title text-faint">{title}</div>
        <div className="track mt-4" />
        <div className="mt-5 flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-4 rounded bg-surface-hi" />
          ))}
        </div>
      </div>
    </div>
  );
}
