"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { Mark } from "@/components/Mark";
import { BRAND } from "@/lib/brand";
import {
  requestResetAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  type AuthState,
} from "@/lib/auth/actions";

type Mode = "signup" | "signin" | "forgot" | "reset";

const ACTIONS: Record<Mode, (s: AuthState, f: FormData) => Promise<AuthState>> = {
  signup: signUpAction,
  signin: signInAction,
  forgot: requestResetAction,
  reset: resetPasswordAction,
};

const COPY: Record<Mode, { title: string; sub: string; cta: string; busy: string }> = {
  signup: {
    title: "Create your account",
    sub: "Free, no card needed. About a minute to set up.",
    cta: "Create account",
    busy: "Creating your account…",
  },
  signin: { title: "Welcome back", sub: `Sign in to ${BRAND.name}.`, cta: "Sign in", busy: "Signing in…" },
  forgot: {
    title: "Reset your password",
    sub: "Enter your email and we'll send you a link.",
    cta: "Send reset link",
    busy: "Sending…",
  },
  reset: { title: "Choose a new password", sub: "At least 8 characters.", cta: "Save and sign in", busy: "Saving…" },
};

export function AuthForm({
  mode,
  next,
  token,
  notice,
  inviteRequired,
  invite: initialInvite,
}: {
  mode: Mode;
  next?: string;
  token?: string;
  notice?: ReactNode;
  inviteRequired?: boolean;
  invite?: string;
}) {
  const [state, action, pending] = useActionState(ACTIONS[mode], null);
  const [tz, setTz] = useState("");
  const [show, setShow] = useState(false);
  // Controlled on purpose: React clears a form once its action finishes, and
  // an "email already in use" must not cost someone everything they typed.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState(initialInvite ?? "");
  const copy = COPY[mode];

  // The account starts in the right timezone with nothing to fill in.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only known in the browser
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  }, []);

  return (
    <main className="auth-shell">
      <div className="ob-glow" aria-hidden />
      <div className="auth-card">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark className="h-8 w-8" gradientId="auth-mark" />
          <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
        </Link>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted">{copy.sub}</p>

        {notice && <div className="auth-notice mt-4">{notice}</div>}

        <form action={action} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="tz" value={tz} />
          {next && <input type="hidden" name="next" value={next} />}
          {token && <input type="hidden" name="token" value={token} />}

          {mode === "signup" && inviteRequired && (
            <label className="auth-field">
              <span>Invite code</span>
              <input name="invite" value={invite} onChange={(e) => setInvite(e.target.value)} required autoComplete="off" spellCheck={false} className="cx-input" />
            </label>
          )}

          {mode === "signup" && (
            <label className="auth-field">
              <span>First name</span>
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={80} className="cx-input" placeholder="Optional" />
            </label>
          )}

          {mode !== "reset" && (
            <label className="auth-field">
              <span>Email</span>
              <input
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoComplete="email"
                autoFocus={mode !== "signup"}
                inputMode="email"
                className="cx-input"
              />
            </label>
          )}

          {mode !== "forgot" && (
            <label className="auth-field">
              <span className="flex items-center justify-between">
                {mode === "reset" ? "New password" : "Password"}
                {mode === "signin" && (
                  <Link href="/forgot" className="text-xs font-normal text-teal hover:underline">
                    Forgot it?
                  </Link>
                )}
              </span>
              <span className="relative block">
                <input
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={show ? "text" : "password"}
                  required
                  minLength={mode === "signin" ? undefined : 8}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="cx-input pr-14"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute inset-y-0 right-3 text-xs text-muted hover:text-ink"
                  aria-pressed={show}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </span>
            </label>
          )}

          {state?.error && (
            <p className="text-sm text-bad" role="alert">
              {state.error}
            </p>
          )}
          {state?.notice && (
            <p className="text-sm text-teal" role="status">
              {state.notice}
            </p>
          )}

          <button type="submit" className="ob-next mt-1 w-full justify-center text-center" disabled={pending}>
            {pending ? copy.busy : copy.cta}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-teal hover:underline">
                Sign in
              </Link>
            </>
          )}
          {mode === "signin" && (
            <>
              New here?{" "}
              <Link href="/signup" className="text-teal hover:underline">
                Create an account
              </Link>
            </>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <Link href="/login" className="text-teal hover:underline">
              Back to sign in
            </Link>
          )}
        </p>

        {mode === "signup" && (
          <p className="mt-4 text-center text-[0.7rem] leading-relaxed text-faint">
            Your data sits in its own private database, and you can download or delete it any time. By creating an
            account you agree to the{" "}
            <Link href="/terms" className="underline hover:text-muted">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-muted">
              Privacy
            </Link>{" "}
            pages.
          </p>
        )}
      </div>
    </main>
  );
}
