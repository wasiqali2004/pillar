import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { touchUser, userForToken, type User } from "./store";

export const SESSION_COOKIE = "pillar_session";
export const TZ_COOKIE = "pillar_tz";

/**
 * A session lookup happens on every database query, so it's held briefly in
 * memory. forgetSessions clears it, so signing out or deleting an account takes
 * effect at once on this server and within seconds on any other.
 */
const TTL_MS = 30_000;
const TOUCH_EVERY_MS = 60 * 60_000;

type Cached = { user: User | null; at: number };
const g = globalThis as unknown as {
  __pillarSessions?: Map<string, Cached>;
  __pillarTouched?: Map<string, number>;
};
const cache = (g.__pillarSessions ??= new Map<string, Cached>());
const touched = (g.__pillarTouched ??= new Map<string, number>());

export function forgetSessions() {
  cache.clear();
}

export async function currentToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function getSessionUser(): Promise<User | null> {
  const token = await currentToken();
  if (!token) return null;

  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.user;

  const user = await userForToken(token);
  if (cache.size > 5000) cache.clear();
  cache.set(token, { user, at: Date.now() });

  if (user && Date.now() - (touched.get(user.id) ?? 0) > TOUCH_EVERY_MS) {
    touched.set(user.id, Date.now());
    void touchUser(user.id).catch(() => {});
  }
  return user;
}

/** For pages: anyone without a valid session goes to sign in. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function setSessionCookies(token: string, maxAge: number, tz: string | null) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  if (tz) jar.set(TZ_COOKIE, tz, { sameSite: "lax", path: "/", maxAge: 400 * 86_400 });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function setTzCookie(tz: string) {
  (await cookies()).set(TZ_COOKIE, tz, { sameSite: "lax", path: "/", maxAge: 400 * 86_400 });
}
