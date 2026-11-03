"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BILLING_LIVE, INACTIVE_UNLINK_DAYS, MAX_LINKED_BANKS, type PlanId, type WidgetId } from "@/lib/dashboard/catalog";
import type { ConnectionInfo, Provider } from "@/lib/connections/vault";
import { connectAction, disconnectAction } from "@/lib/connections/actions";
import { ConnectMoneyClient } from "@/app/connect-money/ConnectMoneyClient";
import { PlanButton } from "@/components/PlanModal";
import { StatementUpload } from "./StatementUpload";
import { FitnessPicker } from "./FitnessPicker";
import { Freshness } from "./Freshness";
import type { SourceHealth } from "@/lib/connections/freshness-types";

type Field = { name: string; label: string; placeholder: string; secret?: boolean; optional?: boolean };

type Spec = {
  provider: Provider;
  name: string;
  blurb: string;
  mark: { text: string; color: string };
  fields: Field[];
  /** Optional second way in, behind a toggle (Shopify's older admin-made apps). */
  alt?: { toggle: string; fields: Field[]; steps: string[] };
  steps: string[];
  link?: { href: string; label: string };
};

const SPECS: Record<Provider, Spec> = {
  hevy: {
    provider: "hevy",
    name: "Hevy",
    blurb: "Every workout you log in Hevy, with sets, reps and weight, lands in Training automatically.",
    mark: { text: "H", color: "#3b82f6" },
    fields: [{ name: "apiKey", label: "Hevy API key", placeholder: "Paste your key", secret: true }],
    steps: [
      "Hevy's API is part of Hevy Pro, so you'll need Pro on your Hevy account.",
      "Sign in at hevy.com and open Settings → Developer.",
      "Copy your API key and paste it here.",
    ],
    link: { href: "https://hevy.com/settings?developer", label: "Open Hevy settings" },
  },
  shopify: {
    provider: "shopify",
    name: "Shopify",
    blurb: "Daily sales and order counts from your store. Totals only, never customer details.",
    mark: { text: "S", color: "#5fb33f" },
    fields: [
      { name: "domain", label: "Store address", placeholder: "my-store.myshopify.com" },
      { name: "clientId", label: "Client ID", placeholder: "From your app's settings" },
      { name: "clientSecret", label: "Client secret", placeholder: "From your app's settings", secret: true },
    ],
    steps: [
      "In Shopify's Dev Dashboard, create an app for your store.",
      "Give it the read_orders access scope, then install it on your store.",
      "Paste your store address and the app's client ID and secret here.",
    ],
    alt: {
      toggle: "I have an Admin API access token instead",
      fields: [
        { name: "domain", label: "Store address", placeholder: "my-store.myshopify.com" },
        { name: "token", label: "Admin API access token", placeholder: "shpat_…", secret: true },
      ],
      steps: [
        "Older custom apps made in your Shopify admin (Settings → Apps → Develop apps) give a permanent token.",
        "Make sure the app has the read_orders scope.",
        "Paste the Admin API access token (starts with shpat_) and your store address here.",
      ],
    },
  },
  square: {
    provider: "square",
    name: "Square",
    blurb: "Completed payments from your Square account, net of refunds. Great for markets and pop-ups.",
    mark: { text: "□", color: "#e8ecf8" },
    fields: [{ name: "token", label: "Production access token", placeholder: "Paste your token", secret: true }],
    steps: [
      "Sign in at developer.squareup.com with your normal Square account.",
      "Create an application (any name) and open it.",
      "Switch to Production, open Credentials, and copy the Production access token.",
    ],
    link: { href: "https://developer.squareup.com/apps", label: "Open Square Developer" },
  },
  stripe: {
    provider: "stripe",
    name: "Your website (Stripe)",
    blurb: "If your site takes card payments through Stripe, as most custom, WooCommerce, Wix and Squarespace stores can.",
    mark: { text: "S", color: "#8b5cf6" },
    fields: [{ name: "key", label: "Restricted key", placeholder: "rk_live_…", secret: true }],
    steps: [
      "In the Stripe Dashboard, open Developers → API keys.",
      "Create a restricted key. Set Charges to Read and leave everything else as None.",
      "Copy the key (starts with rk_live_) and paste it here. It can only read sales, never move money.",
    ],
    link: { href: "https://dashboard.stripe.com/apikeys", label: "Open Stripe API keys" },
  },
};

const BANKS = ["TD", "RBC", "Scotiabank", "BMO", "CIBC", "Wealthsimple", "Tangerine", "EQ Bank", "Amex", "Desjardins"];

type Section = "money" | "fitness" | "business";

const SECTION_WIDGETS: Record<Section, WidgetId[]> = {
  money: ["money", "portfolio"],
  fitness: ["training", "body"],
  business: ["business"],
};

export function ConnectHub({
  welcome,
  plan,
  bankSync,
  unlinkNotice,
  onLayout,
  connections,
  serverManaged,
  bank,
  health,
  freshness,
  isOwner,
  healthResult,
}: {
  welcome: boolean;
  plan: PlanId;
  bankSync: boolean;
  unlinkNotice: { at: string; count: number; idleDays: number } | null;
  onLayout: WidgetId[];
  connections: ConnectionInfo[];
  serverManaged: { hevy: boolean; shopify: boolean };
  bank: { configured: boolean; accounts: { itemId: string; institutionName: string | null }[] };
  health: { configured: boolean; connected: boolean; expired: boolean };
  freshness: SourceHealth[];
  isOwner: boolean;
  healthResult: string | null;
}) {
  const on = new Set(onLayout);
  const sections: Section[] = ["money", "fitness", "business"];
  const relevant = sections.filter((s) => SECTION_WIDGETS[s].some((w) => on.has(w)));
  const others = sections.filter((s) => !relevant.includes(s));
  const byProvider = new Map(connections.map((c) => [c.provider, c]));

  const card = (p: Provider, bare = false) => (
    <ProviderCard
      key={p}
      spec={SPECS[p]}
      connection={byProvider.get(p) ?? null}
      serverManaged={p === "hevy" ? serverManaged.hevy : p === "shopify" ? serverManaged.shopify : false}
      bare={bare}
    />
  );
  const googleConnected = health.connected && !health.expired;

  const render = (s: Section) => {
    if (s === "money") {
      return (
        <Group key={s} title="Money" sub="Money in and out of your bank and cards.">
          <article className="cx-card md:col-span-2">
            <div className="flex items-start gap-4">
              <Mark text="$" color="#2fe1c4" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">Upload a statement</h3>
                  <span className="ob-badge">Free</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  Works with any bank or card. Download your transactions as a file and add them here, as often as you like.
                  Uploading the same dates twice won&apos;t double count.
                </p>
                <StatementUpload />
              </div>
            </div>
          </article>
          {(bankSync || BILLING_LIVE) && (
          <article className="cx-card md:col-span-2">
            <div className="flex items-start gap-4">
              <Mark text="⟳" color="#8b5cf6" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">Automatic bank sync</h3>
                  {BILLING_LIVE && <span className="tier-badge">Pro</span>}
                  {bank.accounts.length > 0 && <span className="ob-badge">{bank.accounts.length} connected</span>}
                </div>
                <p className="mt-1 text-sm text-muted">
                  Link your bank once and new transactions arrive on their own. Your bank&apos;s own login opens through
                  Plaid; Pillar never sees your password, only a read-only link.
                </p>
                <p className="mt-1 text-xs text-faint">
                  Up to {MAX_LINKED_BANKS} accounts. Banks disconnect on their own after {INACTIVE_UNLINK_DAYS} days away from the app,
                  and your transactions stay.
                </p>
                {unlinkNotice && bank.accounts.length === 0 && (
                  <p className="mt-3 rounded-[12px] border border-warn/40 px-3 py-2 text-sm text-warn">
                    We disconnected {unlinkNotice.count === 1 ? "your bank" : `your ${unlinkNotice.count} banks`} on{" "}
                    {new Date(unlinkNotice.at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} after{" "}
                    {unlinkNotice.idleDays} days away. Your transactions are all still here; connect again whenever you like.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {BANKS.map((b) => (
                    <span key={b} className="cx-chip">
                      {b}
                    </span>
                  ))}
                  <span className="cx-chip text-faint">and most others</span>
                </div>
                {!bankSync ? (
                  <div className="mt-4">
                    <PlanButton plan={plan} label="Go Pro for automatic sync" className="pill pill-highlight" />
                  </div>
                ) : bank.configured ? (
                  <ConnectMoneyClient linkedAccounts={bank.accounts} />
                ) : (
                  <p className="mt-4 rounded-[12px] border border-dashed border-line px-4 py-3 text-sm text-muted">
                    Automatic sync isn&apos;t switched on for this copy of Pillar yet. Statement upload works in the meantime.
                  </p>
                )}
              </div>
            </div>
          </article>
          )}
          <Manual>
            <p>Just a few things to track? Add money in or out yourself; it takes seconds.</p>
            <LogLinks on={on} links={[{ hash: "#add-money", label: "Add money in or out", widget: "money", tile: "Money" }]} />
          </Manual>
        </Group>
      );
    }
    if (s === "fitness") {
      return (
        <Group key={s} title="Fitness" sub="Pick the app or watch you use and you'll see the easiest way to bring it in. No app? Log it yourself.">
          <FitnessPicker
            googleConnected={googleConnected}
            hevyConnected={byProvider.has("hevy") || serverManaged.hevy}
            hevy={card("hevy", true)}
            manual={
              <LogLinks
                on={on}
                lead="Log it yourself:"
                links={[
                  { hash: "#log-workout", label: "Log a workout", widget: "training", tile: "Training" },
                  { hash: "#log-body", label: "Log steps, sleep or weight", widget: "body", tile: "Body" },
                ]}
              />
            }
            google={
              /* Fitbit and Pixel watches go through Google Health now: the old
                 Fitbit Web API stopped serving data on 2 November 2026. Nothing
                 about Cloud projects appears here; that's owner setup's job. */
              <div>
                <p className="text-sm text-muted">Steps, calories burned and sleep, kept up to date by itself, all day.</p>
                {googleConnected ? (
                  <p className="mt-3 text-sm text-teal">✓ Connected. Your numbers refresh roughly every 10 minutes.</p>
                ) : health.configured ? (
                  <>
                    {/* A plain link: the route redirects the whole page to Google. */}
                    <a href="/api/auth/google-health" className="ob-next mt-3 inline-flex">
                      {health.expired ? "Reconnect" : "Connect with Google"}
                    </a>
                    <p className="mt-2 text-[0.72rem] text-faint">
                      Opens Google, you press Allow, and you&apos;re back here. In early access, Google only lets approved
                      testers through, so use the file upload below if it says the app is blocked.
                    </p>
                  </>
                ) : (
                  <Unavailable isOwner={isOwner} />
                )}
              </div>
            }
          />
        </Group>
      );
    }
    return (
      <Group key={s} title="Business" sub="Your sales, added up per day. Connect as many as you use; the tile adds them together.">
        {card("shopify")}
        {card("square")}
        {card("stripe")}
        <Manual>
          Selling on Etsy, Wix or WooCommerce? Most of them take payments through Stripe or Square, so connect that one.
        </Manual>
      </Group>
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-teal uppercase">{welcome ? "Last step" : "Connections"}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {welcome ? "Connect your apps" : "Your connections"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            All free. Connect what you use so your dashboard fills itself in, or skip and log things yourself. You can change these any time.
          </p>
        </div>
        <Link href="/app" className={welcome ? "ob-next" : "pill"}>
          {welcome ? "Go to my dashboard →" : "← Dashboard"}
        </Link>
      </header>

      {healthResult && healthResult !== "connected" && (
        <p className="mb-5 rounded-[14px] border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink" role="alert">
          {healthResult === "denied"
            ? "Fitbit wasn't connected. If Google said the app is blocked, it's because Pillar is in early access and only approved testers can connect so far. The file upload below works for everyone."
            : "That didn't finish connecting. Please try again."}
        </p>
      )}

      {/* Before the provider cards: most visits here are "is my data still
          current?", not "let me add something new". */}
      {!welcome && <Freshness sources={freshness} />}

      {relevant.map(render)}

      {others.length > 0 && (
        <details className="cx-more mt-10">
          <summary className="cursor-pointer text-sm text-muted hover:text-ink">
            More you can connect ({others.map((o) => o[0].toUpperCase() + o.slice(1)).join(", ")})
          </summary>
          {others.map(render)}
        </details>
      )}

      {welcome && (
        <div className="mt-10 flex justify-end">
          <Link href="/app" className="pill">
            Skip for now
          </Link>
        </div>
      )}
    </main>
  );
}

function Group({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-3 text-[0.62rem] font-semibold tracking-[0.18em] text-faint uppercase">
        {title}
        <span className="h-px flex-1 bg-line-soft" />
      </h2>
      <p className="mt-2 text-sm text-muted">{sub}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * What a user sees for a provider whose backend the owner has not wired up.
 *
 * A person who wants to see their steps isn't the person who creates OAuth
 * clients, so only the owner gets a way through to the setup steps.
 */
function Unavailable({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="mt-3">
      <span className="cx-soon">Not switched on yet</span>
      {isOwner ? (
        <p className="mt-1.5 text-[0.72rem] text-faint">
          <Link href="/app/setup" className="text-teal hover:underline">
            Switch it on in owner setup
          </Link>
        </p>
      ) : (
        <p className="mt-1.5 text-[0.72rem] text-faint">Coming soon. The file upload below works today.</p>
      )}
    </div>
  );
}

function Manual({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 self-start rounded-[14px] border border-dashed border-line px-4 py-3 text-sm text-muted md:col-span-2">
      <span aria-hidden className="text-teal">✎</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Buttons straight to a tile's log form (the tile opens it from the #hash).
 * A tile that isn't on the dashboard can't open, so that one says where to add it.
 */
function LogLinks({
  on,
  lead,
  links,
}: {
  on: Set<WidgetId>;
  lead?: string;
  links: { hash: string; label: string; widget: WidgetId; tile: string }[];
}) {
  return (
    <div className="mt-1">
      {lead && <p className="text-sm text-muted">{lead}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((l) =>
          on.has(l.widget) ? (
            <Link key={l.hash} href={`/app${l.hash}`} className="pill pill-highlight">
              {l.label} →
            </Link>
          ) : (
            <span key={l.hash} className="text-xs text-faint">
              {l.label}: add the {l.tile} widget first, from <b>Customize</b> on your dashboard.
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function Mark({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-lg font-bold"
      style={{ background: `${color}22`, color, boxShadow: `inset 0 0 0 1px ${color}55` }}
      aria-hidden
    >
      {text}
    </span>
  );
}

function ProviderCard({
  spec,
  connection,
  serverManaged,
  bare = false,
}: {
  spec: Spec;
  connection: ConnectionInfo | null;
  serverManaged: boolean;
  /** Inside another card (the fitness picker): no frame or logo of its own. */
  bare?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [useAlt, setUseAlt] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fields = useAlt && spec.alt ? spec.alt.fields : spec.fields;
  const steps = useAlt && spec.alt ? spec.alt.steps : spec.steps;
  const connected = connection !== null || serverManaged;

  function submit() {
    setError(null);
    setNote(null);
    const sent = Object.fromEntries(fields.map((f) => [f.name, values[f.name] ?? ""]));
    start(async () => {
      const r = await connectAction(spec.provider, sent);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setValues({});
      setOpen(false);
      setNote(r.note ?? null);
      router.refresh();
    });
  }

  function disconnect() {
    start(async () => {
      await disconnectAction(spec.provider);
      router.refresh();
    });
  }

  return (
    <article className={bare ? "" : `cx-card ${open ? "md:col-span-2" : ""}`}>
      <div className="flex items-start gap-4">
        {!bare && <Mark text={spec.mark.text} color={spec.mark.color} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{spec.name}</h3>
            {connected && <span className="ob-badge">Connected</span>}
          </div>
          <p className="mt-1 text-sm text-muted">{spec.blurb}</p>

          {connection && (
            <p className="mt-2 text-xs text-faint">
              {connection.label} · since {new Date(connection.connectedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
            </p>
          )}
          {serverManaged && <p className="mt-2 text-xs text-faint">Connected through this server&apos;s settings.</p>}
          {note && <p className="mt-2 text-xs text-warn">{note}</p>}

          {!open && (
            <div className="mt-3 flex gap-2">
              {connection ? (
                <button type="button" className="pill" onClick={disconnect} disabled={pending}>
                  {pending ? "…" : "Disconnect"}
                </button>
              ) : (
                !serverManaged && (
                  <button type="button" className="pill pill-highlight" onClick={() => setOpen(true)}>
                    Connect
                  </button>
                )
              )}
            </div>
          )}

          {open && (
            <div className="mt-4 grid gap-5 md:grid-cols-[1fr_1.1fr]">
              <ol className="cx-steps">
                {steps.map((s, i) => (
                  <li key={i}>
                    <span className="cx-step-n">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
                {spec.link && (
                  <li>
                    <a href={spec.link.href} target="_blank" rel="noreferrer" className="text-sm text-teal hover:underline">
                      {spec.link.label} ↗
                    </a>
                  </li>
                )}
              </ol>

              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                {fields.map((f) => (
                  <label key={f.name} className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-muted">{f.label}</span>
                    <input
                      type={f.secret ? "password" : "text"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={f.placeholder}
                      value={values[f.name] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="cx-input"
                    />
                  </label>
                ))}
                {spec.alt && (
                  <button
                    type="button"
                    className="self-start text-xs text-teal hover:underline"
                    onClick={() => {
                      setUseAlt((u) => !u);
                      setError(null);
                    }}
                  >
                    {useAlt ? "Use a Dev Dashboard app instead" : spec.alt.toggle}
                  </button>
                )}
                {error && <p className="text-sm text-bad">{error}</p>}
                <p className="text-[0.7rem] text-faint">Checked with {spec.name.replace(/^Your website \((.+)\)$/, "$1")} first, then stored encrypted. It&apos;s never shown again.</p>
                <div className="flex gap-2">
                  <button type="submit" className="ob-next" disabled={pending}>
                    {pending ? "Checking…" : "Connect"}
                  </button>
                  <button type="button" className="pill" onClick={() => setOpen(false)} disabled={pending}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
