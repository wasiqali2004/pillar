"use server";

import { renameSync, existsSync, rmSync } from "node:fs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidTz } from "@/lib/date";
import { savePrayerSettings } from "@/lib/widgets/prayers/settings";
import { runAsUser } from "./context";
import { hostedUrl, inviteCode, isHosted, isOwnerSignup } from "./hosting";
import { sendResetEmail, sendVerifyEmail } from "./mail";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password";
import { legacyDbPath, userDbPath } from "./paths";
import { clearSessionCookie, currentToken, forgetSessions, requireUser, setSessionCookies, setTzCookie } from "./session";
import {
  consumeResetToken,
  consumeVerifyToken,
  countUsers,
  createResetToken,
  createSession,
  createUser,
  createVerifyToken,
  deleteSession,
  deleteSessionsFor,
  findUserByEmail,
  getUser,
  joinWaitlist,
  leaveWaitlist,
  markEmailVerified,
  setPasswordHash,
  setUserName,
  setUserTimezone,
} from "./store";

export type AuthState = { error?: string; notice?: string } | null;

const MIN_PASSWORD = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── rate limiting ─────────────────────────────────────────────
   Per server process. Enough to stop someone guessing passwords by hand or
   with a simple script; a multi-server deploy would need a shared store. */
const attempts = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 10;

/**
 * The address the host's own proxy saw. The first x-forwarded-for entry is
 * whatever the client chose to send, so it can't be what a limit counts by.
 */
async function clientIp() {
  const h = await headers();
  return h.get("fly-client-ip") ?? h.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "local";
}

async function limited(bucket: string, max = MAX_ATTEMPTS) {
  const key = `${bucket}:${await clientIp()}`;
  const now = Date.now();
  if (attempts.size > 20_000) attempts.clear();
  const cur = attempts.get(key);
  if (!cur || cur.until < now) {
    attempts.set(key, { n: 1, until: now + WINDOW_MS });
    return false;
  }
  cur.n += 1;
  return cur.n > max;
}

/**
 * Built from the configured address on a server: a forged Host header must not
 * be able to send someone a real link that points at another site.
 */
async function baseUrl() {
  const h = await headers();
  return hostedUrl() ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

const safeNext = (raw: FormDataEntryValue | null) => {
  const s = typeof raw === "string" ? raw : "";
  // Same-site paths only: a crafted ?next= must not bounce someone off to another site.
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : null;
};

const tzFrom = (form: FormData) => {
  const tz = form.get("tz");
  return typeof tz === "string" && isValidTz(tz) ? tz : null;
};

/* ── sign up ─────────────────────────────────────────────────── */

export async function signUpAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 80) || null;

  if (!EMAIL.test(email)) return { error: "That doesn't look like an email address." };
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters for your password.` };
  if (await limited("signup")) return { error: "Too many tries. Give it a few minutes and try again." };
  const invite = inviteCode();
  if (invite && String(form.get("invite") ?? "").trim() !== invite) {
    return { error: "That invite code isn't right." };
  }
  if (await findUserByEmail(email)) {
    return { error: "There's already an account with that email. Sign in instead." };
  }

  const firstAccount = (await countUsers()) === 0;
  const user = await createUser({
    email,
    name,
    passwordHash: await hashPassword(password),
    timezone: tzFrom(form),
    isOwner: isOwnerSignup(email, firstAccount),
  });

  // The first account made on this machine takes over the data from before
  // accounts existed. Never on a server: the owner brings their data in from
  // Owner setup there, once they've signed in.
  let claimed = false;
  if (firstAccount && !isHosted() && (await isLocalRequest()) && existsSync(legacyDbPath())) {
    renameSync(legacyDbPath(), userDbPath(user.id));
    for (const suffix of ["-wal", "-shm"]) rmSync(`${legacyDbPath()}${suffix}`, { force: true });
    claimed = true;
    await runAsUser(user.id, tzFrom(form), () =>
      savePrayerSettings({ latitude: 43.6532, longitude: -79.3832, place: "Toronto", method: "NorthAmerica", madhab: "shafi" }),
    );
  }

  await leaveWaitlist(email);
  await sendVerifyEmail(email, `${await baseUrl()}/verify?token=${await createVerifyToken(user.id)}`);

  const session = await createSession(user.id);
  await setSessionCookies(session.token, session.maxAge, tzFrom(form));
  redirect(claimed ? "/app" : "/welcome");
}

async function isLocalRequest() {
  const host = ((await headers()).get("host") ?? "").split(":")[0];
  return host === "localhost" || host === "127.0.0.1";
}

/* ── sign in / out ───────────────────────────────────────────── */

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const wrong = { error: "That email and password don't match." };

  if (!email || !password) return { error: "Enter your email and password." };
  if ((await limited(`signin:${email.toLowerCase()}`)) || (await limited("signin", 50))) {
    return { error: "Too many tries. Give it a few minutes and try again." };
  }

  const found = await findUserByEmail(email);
  if (!found) {
    await burnPasswordCheck(password);
    return wrong;
  }
  if (!(await verifyPassword(password, found.passwordHash))) return wrong;

  const tz = tzFrom(form);
  if (tz && tz !== found.user.timezone) await setUserTimezone(found.user.id, tz);

  const session = await createSession(found.user.id);
  await setSessionCookies(session.token, session.maxAge, tz ?? found.user.timezone);
  redirect(safeNext(form.get("next")) ?? "/app");
}

export async function signOutAction() {
  const token = await currentToken();
  if (token) await deleteSession(token);
  forgetSessions();
  await clearSessionCookie();
  redirect("/login");
}

/* ── password reset ──────────────────────────────────────────── */

export async function requestResetAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  if (!EMAIL.test(email)) return { error: "That doesn't look like an email address." };
  if (await limited("reset")) return { error: "Too many tries. Give it a few minutes and try again." };

  const found = await findUserByEmail(email);
  if (found) {
    const token = await createResetToken(found.user.id);
    await sendResetEmail(found.user.email, `${await baseUrl()}/reset?token=${token}`);
  }
  // The same answer either way, so this can't be used to test who has an account.
  return { notice: "If that email has an account, a reset link is on its way. It works once, for one hour." };
}

export async function resetPasswordAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters for your password.` };

  const userId = await consumeResetToken(token);
  if (!userId) return { error: "That reset link has expired or was already used. Ask for a new one." };

  await setPasswordHash(userId, await hashPassword(password));
  // Getting here took a link sent to that inbox, which proves the same thing.
  await markEmailVerified(userId);
  await deleteSessionsFor(userId);
  forgetSessions();
  const session = await createSession(userId);
  await setSessionCookies(session.token, session.maxAge, null);
  redirect("/app");
}

/* ── email confirmation and the waitlist ─────────────────────── */

/** A button press, not the page load: mail scanners open links on their own. */
export async function verifyEmailAction(form: FormData) {
  const userId = await consumeVerifyToken(String(form.get("token") ?? ""));
  forgetSessions();
  redirect(userId ? "/app" : "/verify?failed=1");
}

export async function resendVerificationAction(): Promise<{ sent: boolean }> {
  const user = await requireUser();
  if (user.emailVerified || (await limited("verify", 5))) return { sent: false };
  return { sent: await sendVerifyEmail(user.email, `${await baseUrl()}/verify?token=${await createVerifyToken(user.id)}`) };
}

export async function joinWaitlistAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().slice(0, 200);
  if (!EMAIL.test(email)) return { error: "That doesn't look like an email address." };
  if (await limited("waitlist")) return { error: "Too many tries. Give it a few minutes and try again." };
  await joinWaitlist(email);
  return { notice: "You're on the list. You'll get an invite by email." };
}

/* ── account settings ────────────────────────────────────────── */

export async function updateNameAction(name: string) {
  const user = await requireUser();
  await setUserName(user.id, name.trim().slice(0, 80) || null);
  forgetSessions();
}

export async function changePasswordAction(current: string, next: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (next.length < MIN_PASSWORD) return { ok: false, error: `Use at least ${MIN_PASSWORD} characters.` };
  const found = await getUser(user.id);
  if (!found || !(await verifyPassword(current, found.passwordHash))) {
    return { ok: false, error: "Your current password isn't right." };
  }
  await setPasswordHash(user.id, await hashPassword(next));
  // Signed in elsewhere? Those sessions end now; this one stays.
  await deleteSessionsFor(user.id, (await currentToken()) ?? undefined);
  forgetSessions();
  return { ok: true };
}

/**
 * Keeps the day boundary and prayer times right when someone travels: the
 * browser reports its timezone and the server follows, with no setting to find.
 */
export async function syncTimezoneAction(tz: string) {
  if (!isValidTz(tz)) return;
  const user = await requireUser();
  await setTzCookie(tz);
  if (tz !== user.timezone) {
    await setUserTimezone(user.id, tz);
    forgetSessions();
  }
}

