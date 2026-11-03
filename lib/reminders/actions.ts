"use server";

import { requireUser } from "@/lib/auth/session";
import { parseSubscription, removeSubscription, savePrefs, saveSubscription, sendPush } from "./push";

export async function enablePushAction(sub: unknown): Promise<{ ok: boolean }> {
  await requireUser();
  const parsed = parseSubscription(sub);
  if (!parsed) return { ok: false };
  await saveSubscription(parsed);
  return { ok: true };
}

export async function disablePushAction(endpoint: string) {
  await requireUser();
  await removeSubscription(String(endpoint));
}

export async function saveReminderPrefsAction(prefs: unknown) {
  await requireUser();
  return savePrefs(prefs);
}

export async function sendTestReminderAction(): Promise<{ delivered: number }> {
  await requireUser();
  return { delivered: await sendPush({ title: "Reminders are on", body: "This is what they'll look like.", tag: "test", url: "/app" }) };
}
