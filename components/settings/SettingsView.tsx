"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { changePasswordAction, signOutAction, updateNameAction } from "@/lib/auth/actions";
import { deleteAccountAction, savePrayerSettingsAction } from "@/lib/account/actions";
import type { PrayerSettings } from "@/lib/prayer-options";
import type { ReminderPrefs } from "@/lib/reminders/schedule";
import { PrayerSetup } from "./PrayerSetup";
import { Reminders } from "./Reminders";

export function SettingsView({
  email,
  name,
  timezone,
  prayer,
  showPrayer,
  isOwner,
  reminders,
}: {
  email: string;
  name: string | null;
  timezone: string;
  prayer: PrayerSettings | null;
  showPrayer: boolean;
  isOwner: boolean;
  reminders: { publicKey: string; prefs: ReminderPrefs };
}) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-7 sm:py-8">
      <Link href="/app" className="text-[0.72rem] text-faint hover:text-teal">
        ← Dashboard
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        <span className="grad-text">Settings</span>
      </h1>

      <Card title="Your account">
        <NameRow initial={name} />
        <p className="mt-3 text-sm text-muted">
          Email <span className="text-ink">{email}</span>
        </p>
        <p className="mt-1 text-sm text-muted">
          Timezone <span className="text-ink">{timezone}</span>{" "}
          <span className="text-xs text-faint">follows your device automatically</span>
        </p>
        <PasswordRow />
        <form action={signOutAction} className="mt-5">
          <button type="submit" className="pill">
            Sign out
          </button>
        </form>
      </Card>

      {showPrayer && (
        <Card title="Prayer times" id="prayer">
          <PrayerSection initial={prayer} />
        </Card>
      )}

      <Card title="Reminders" id="reminders">
        <Reminders publicKey={reminders.publicKey} initial={reminders.prefs} showPrayers={showPrayer} hasPrayerPlace={prayer !== null} />
      </Card>

      <Card title="Your dashboard">
        <p className="text-sm text-muted">Change what you focus on and which widgets you see. Nothing you&apos;ve logged is lost.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/welcome" className="pill">
            Redo setup
          </Link>
          <Link href="/app/connect" className="pill">
            Manage connections
          </Link>
          {isOwner && (
            <Link href="/app/setup" className="pill">
              Owner setup
            </Link>
          )}
        </div>
      </Card>

      <Card title="Your data">
        <p className="text-sm text-muted">
          Everything you&apos;ve logged, as one file. Saved passwords and connection keys are left out.
        </p>
        <a href="/api/account/export" className="pill mt-3 inline-flex">
          Download my data
        </a>
        <DeleteRow />
      </Card>

      <p className="mt-6 text-center text-xs text-faint">
        <Link href="/privacy" className="hover:text-muted">
          Privacy
        </Link>
        {" · "}
        <Link href="/terms" className="hover:text-muted">
          Terms
        </Link>
      </p>
    </main>
  );
}

function Card({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="rv-card mt-5 scroll-mt-6">
      <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-faint">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function NameRow({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await updateNameAction(value);
          setSaved(true);
        });
      }}
    >
      <label className="auth-field flex-1">
        <span>First name</span>
        <input
          className="cx-input"
          value={value}
          maxLength={80}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <button type="submit" className="pill" disabled={pending}>
        {saved ? "Saved ✓" : "Save"}
      </button>
    </form>
  );
}

function PasswordRow() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="mt-3 text-sm text-teal hover:underline" onClick={() => setOpen(true)}>
        Change password
      </button>
    );
  }
  return (
    <form
      className="mt-4 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await changePasswordAction(current, next);
          setMsg(r.ok ? { ok: true, text: "Password changed." } : { ok: false, text: r.error ?? "Couldn't change it." });
          if (r.ok) {
            setCurrent("");
            setNext("");
          }
        });
      }}
    >
      <label className="auth-field">
        <span>Current password</span>
        <input type="password" autoComplete="current-password" required className="cx-input" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="auth-field">
        <span>New password</span>
        <input type="password" autoComplete="new-password" required minLength={8} className="cx-input" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      {msg && <p className={`text-sm ${msg.ok ? "text-teal" : "text-bad"}`}>{msg.text}</p>}
      <div>
        <button type="submit" className="pill" disabled={pending}>
          {pending ? "Saving…" : "Save new password"}
        </button>
      </div>
    </form>
  );
}

function PrayerSection({ initial }: { initial: PrayerSettings | null }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <PrayerSetup
        value={value}
        onChange={(v) => {
          setValue(v);
          setSaved(false);
        }}
      />
      <button
        type="button"
        className="pill mt-4"
        disabled={!value || pending}
        onClick={() =>
          start(async () => {
            await savePrayerSettingsAction(value);
            setSaved(true);
          })
        }
      >
        {saved ? "Saved ✓" : pending ? "Saving…" : "Save prayer settings"}
      </button>
    </>
  );
}

function DeleteRow() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="mt-5 border-t border-line-soft pt-4">
        <button type="button" className="text-sm text-bad hover:underline" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      </div>
    );
  }
  return (
    <form
      className="mt-5 flex flex-col gap-3 border-t border-line-soft pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await deleteAccountAction(password);
          if (r?.error) setError(r.error);
        });
      }}
    >
      <p className="text-sm text-muted">
        This permanently deletes your account and everything in it, unlinks any bank and disconnects Google. It can&apos;t be undone.
      </p>
      <label className="auth-field">
        <span>Enter your password to confirm</span>
        <input type="password" autoComplete="current-password" required className="cx-input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="pill border-bad text-bad" disabled={pending}>
          {pending ? "Deleting…" : "Delete everything"}
        </button>
        <button type="button" className="pill" onClick={() => setOpen(false)}>
          Keep my account
        </button>
      </div>
    </form>
  );
}
