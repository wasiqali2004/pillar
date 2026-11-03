"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/auth/password";
import { clearSessionCookie, forgetSessions, requireUser } from "@/lib/auth/session";
import { deleteSessionsFor, deleteUserRow, getUser } from "@/lib/auth/store";
import { destroyUserDb } from "@/lib/db";
import { revokeGoogleHealth } from "@/lib/health/google-health";
import { linkedAccounts, unlinkAccount } from "@/lib/plaid/client";
import type { PlaceResult } from "@/lib/prayer-options";
import { savePrayerSettings } from "@/lib/widgets/prayers/settings";

/**
 * City search for prayer times. Only the words typed here leave the server, and
 * they go to Open-Meteo's free geocoder, which needs no key.
 */
export async function searchPlacesAction(query: string): Promise<PlaceResult[]> {
  await requireUser();
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: "6", language: "en", format: "json" })}`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string }[];
    };
    return (json.results ?? []).map((r) => ({
      label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone ?? null,
    }));
  } catch {
    return [];
  }
}

export async function savePrayerSettingsAction(input: unknown) {
  await requireUser();
  const saved = await savePrayerSettings(input);
  revalidatePath("/app");
  return saved;
}

/**
 * Deletes everything: the user's whole database file, and their sign-in. Linked
 * banks and the Google connection are released first, so nothing keeps billing
 * or keeps a grant open after the data is gone. Those are best-effort: a failed
 * call to a third party must not stop someone leaving.
 */
export async function deleteAccountAction(password: string): Promise<{ error: string } | void> {
  const user = await requireUser();
  const found = await getUser(user.id);
  if (!found || !(await verifyPassword(password, found.passwordHash))) {
    return { error: "That password isn't right." };
  }

  try {
    for (const item of await linkedAccounts()) await unlinkAccount(item.itemId);
  } catch {}
  try {
    await revokeGoogleHealth();
  } catch {}

  // Sessions end first, so no request can reopen the database while it is removed.
  await deleteSessionsFor(user.id);
  forgetSessions();
  await destroyUserDb(user.id);
  await deleteUserRow(user.id);
  await clearSessionCookie();
  redirect("/");
}
