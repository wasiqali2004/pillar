import Link from "next/link";
import { HEALTH_PROVIDERS, PLANNED_PROVIDERS } from "@/lib/connections/providers";
import { healthStatus } from "@/lib/health/google-health";
import { moneyLinkStatus } from "@/lib/money/plaid";
import { notFound } from "next/navigation";
import { MoveDataIn } from "@/components/settings/MoveDataIn";
import { PeopleCard } from "@/components/settings/PeopleCard";
import { runAsUser } from "@/lib/auth/context";
import { hostedUrl, inviteCode, isHosted } from "@/lib/auth/hosting";
import { requireUser } from "@/lib/auth/session";
import { activeUsers, allUsers, listWaitlist } from "@/lib/auth/store";
import { readUsed } from "@/lib/rafiq/usage";
import { RAFIQ_MONTHLY_MESSAGES } from "@/lib/dashboard/catalog";

export const dynamic = "force-dynamic";

export const metadata = { title: "Owner setup" };

/**
 * The one-time wiring the person who runs Pillar does, kept off the
 * Connect page entirely.
 *
 * It used to sit inside the user's Fitbit card, which made a six-step Google
 * Cloud walkthrough the first thing anyone saw when they wanted to tap
 * "Connect". Users should never meet this page; it exists so that when they
 * do tap Connect, there is something on the other end.
 */
export default async function SetupPage() {
  if (!(await requireUser()).isOwner) notFound();
  const [health, bank] = await Promise.all([healthStatus(), moneyLinkStatus()]);

  const google = HEALTH_PROVIDERS.find((p) => p.id === "google_health")!;

  const [everyone, activeWeek, waitlist] = await Promise.all([allUsers(), activeUsers(7), listWaitlist()]);
  let rafiqMessages = 0;
  for (const u of everyone) {
    rafiqMessages += await runAsUser(u.id, u.timezone, readUsed).catch(() => 0);
  }
  const invite = inviteCode();

  return (
    <main className="mx-auto w-full max-w-[820px] px-4 py-6 sm:px-7 sm:py-8">
      <Link href="/app/connect" className="text-[0.72rem] text-faint hover:text-teal">
        ← Connections
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        <span className="grad-text">Owner setup</span>
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        This page is for whoever runs Pillar, not for the people using it. Each service here is wired up once; after
        that every user just presses a button.
      </p>

      <section className="mt-7 flex flex-col gap-4">
        <PeopleCard
          accounts={everyone.length}
          activeWeek={activeWeek.length}
          rafiqMessages={rafiqMessages}
          inviteLink={invite ? `${hostedUrl() ?? "http://localhost:3001"}/signup?invite=${invite}` : null}
          waitlist={waitlist.map((w) => w.email)}
        />

        {isHosted() && (
          <article className="cx-card">
            <h2 className="font-semibold">Bring your data from your computer</h2>
            <p className="mt-1 text-sm text-muted">
              Upload the pillar.db file from your project folder. Your Fitbit history, habits and settings move into this
              account, and the file on your computer stays as it is.
            </p>
            <MoveDataIn />
          </article>
        )}

        <SetupCard
          name={google.name}
          done={health.configured}
          doneLabel={health.connected ? "Wired up, and your account is connected" : "Wired up — users can press Connect"}
          todoLabel="Not wired up yet, so the Connect button stays switched off"
          env={google.requires ?? []}
          steps={google.setup!.steps}
          warnings={google.setup!.warnings ?? []}
          console={google.setup!.console}
          consoleLabel="Open Google Cloud Console"
        />

        <SetupCard
          name="Rafiq"
          done={Boolean(process.env.ANTHROPIC_API_KEY)}
          doneLabel="Switched on for everyone"
          todoLabel="Off until there's an API key. The weekly review's numbers still work without it."
          env={["ANTHROPIC_API_KEY"]}
          steps={[
            "Sign in at console.anthropic.com and add billing credit.",
            "Under API keys, create a key.",
            "Add it to the server as ANTHROPIC_API_KEY (or to .env.local at home), then restart.",
          ]}
          warnings={[
            `Pillar is free, so every message is on your bill: a fraction of a cent each, capped at ${RAFIQ_MONTHLY_MESSAGES} per person per month. Set a monthly spend limit in the Anthropic console.`,
          ]}
          console="https://console.anthropic.com/settings/keys"
          consoleLabel="Open Anthropic console"
        />

        <SetupCard
          name="Automatic bank sync (Plaid)"
          done={bank.configured}
          doneLabel="Wired up — users can link a bank"
          todoLabel="Not wired up. Statement upload still works for everyone without it."
          env={["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV"]}
          steps={[
            "Create a Plaid account and open the Dashboard.",
            "Copy the client ID and the secret for the environment you want.",
            "Add them to the server (or to .env.local at home) and restart.",
          ]}
          warnings={[
            "Plaid bills per linked account per month, so until there are paid plans only your own account can link a bank. Everyone else uploads statements.",
          ]}
          console="https://dashboard.plaid.com/developers/keys"
          consoleLabel="Open Plaid dashboard"
        />
      </section>

      <section className="mt-8">
        <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-faint">Asked for, not built yet</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {PLANNED_PROVIDERS.map((p) => (
            <li key={p.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
              <span className="font-medium text-ink">{p.name}</span>
              <span className="text-muted">{p.note}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.72rem] leading-relaxed text-faint">
          These are deliberately absent from the Connect page rather than shown as buttons that do nothing.
        </p>
      </section>
    </main>
  );
}

function SetupCard({
  name,
  done,
  doneLabel,
  todoLabel,
  env,
  steps,
  warnings,
  console: consoleUrl,
  consoleLabel,
}: {
  name: string;
  done: boolean;
  doneLabel: string;
  todoLabel: string;
  env: string[];
  steps: string[];
  warnings: string[];
  console: string;
  consoleLabel: string;
}) {
  return (
    <article className="cx-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{name}</h2>
        <span className={`su-status ${done ? "is-on" : ""}`}>{done ? "Ready" : "Needs setup"}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{done ? doneLabel : todoLabel}</p>

      {!done && (
        <>
          <ol className="cx-steps mt-4">
            {steps.map((s, i) => (
              <li key={i}>
                <span className="cx-step-n">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>

          <div className="mt-4">
            <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-faint">
              Settings to add
            </p>
            <pre className="su-env mt-1.5">{env.map((k) => `${k}=`).join("\n")}</pre>
          </div>

          <a href={consoleUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm text-teal hover:underline">
            {consoleLabel} ↗
          </a>
        </>
      )}

      {warnings.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 border-t border-line-soft pt-3">
          {warnings.map((w, i) => (
            <li key={i} className="flex gap-2 text-[0.72rem] leading-relaxed text-faint">
              <span aria-hidden className="text-warn">!</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
