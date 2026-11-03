import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { redirect } from "next/navigation";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { isValidTz, setTzResolver } from "@/lib/date";
import { getSessionUser, TZ_COOKIE } from "./session";

/**
 * Which user a piece of server code is working for.
 *
 * During a request that's whoever the session cookie says. Background work (the
 * scheduler, cron) has no request, so it names the user with runAsUser. With
 * neither there is no user and the database refuses to open: forgetting to
 * scope something fails loudly instead of reading someone else's file.
 */
type Scope = { userId: string; tz: string | null };

const g = globalThis as unknown as { __pillarScope?: AsyncLocalStorage<Scope> };
const scope = (g.__pillarScope ??= new AsyncLocalStorage<Scope>());

export function runAsUser<T>(userId: string, tz: string | null, fn: () => Promise<T>): Promise<T> {
  return scope.run({ userId, tz }, fn);
}

export async function currentUserId(): Promise<string> {
  const s = scope.getStore();
  if (s) return s.userId;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user.id;
}

/**
 * The user's timezone, needed synchronously because localDate() is called from
 * dozens of plain functions. Next only offers cookies() as a promise, so this
 * reads the request store behind it. That is an internal API, which is
 * acceptable here because the only way it can fail is a fallback timezone,
 * never someone else's data: identity above uses the public cookies() API.
 */
setTzResolver(() => {
  const s = scope.getStore();
  if (s) return s.tz ?? undefined;
  try {
    const store = workUnitAsyncStorage.getStore();
    if (store?.type !== "request") return undefined;
    const tz = store.cookies.get(TZ_COOKIE)?.value;
    return tz && isValidTz(tz) ? tz : undefined;
  } catch {
    return undefined;
  }
});
