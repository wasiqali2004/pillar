import "server-only";
import { unlinkInactiveBanks } from "@/lib/activity";
import { runAsUser } from "@/lib/auth/context";
import { activeUsers, allUsers, purgeExpired } from "@/lib/auth/store";
import { sweepEmptyDbs } from "@/lib/db";
import { sendDueReminders } from "@/lib/reminders/run";
import { backgroundSync } from "./index";

/**
 * Keeps everyone's numbers current with no tab open.
 *
 * Runs inside the server process, so it works anywhere the server stays up. Each
 * source keeps its own throttle (health 10 minutes, sales 30, banks an hour), so
 * this ticks often and most ticks do little. Serverless hosts freeze between
 * requests; there, a scheduler calls POST /api/refresh instead, which runs the
 * same syncEveryone below.
 */
const TICK_MS = 5 * 60_000;
const FIRST_RUN_MS = 20_000;
const DAY_MS = 24 * 60 * 60_000;
const REMIND_MS = 60_000;

const g = globalThis as unknown as {
  __pillarScheduler?: boolean;
  __pillarSyncing?: boolean;
  __pillarDaily?: number;
  __pillarReminding?: boolean;
};

/** Every minute, because a prayer reminder five minutes late isn't much of one. */
export async function remindEveryone() {
  if (g.__pillarReminding) return;
  g.__pillarReminding = true;
  try {
    for (const u of await activeUsers()) {
      try {
        await runAsUser(u.id, u.timezone, sendDueReminders);
      } catch (e) {
        console.error("[pillar] reminders failed for one user:", e instanceof Error ? e.message : e);
      }
    }
  } finally {
    g.__pillarReminding = false;
  }
}

/** Plaid bills for every linked bank, so anyone long gone is unlinked. Checks each user in turn. */
export async function unlinkInactiveEveryone() {
  let unlinked = 0;
  const users = await allUsers();
  for (const u of users) {
    try {
      unlinked += (await runAsUser(u.id, u.timezone, unlinkInactiveBanks)).unlinked;
    } catch (e) {
      console.error("[pillar] inactive-bank check failed for one user:", e instanceof Error ? e.message : e);
    }
  }
  return { users: users.length, unlinked };
}

async function dailyChores() {
  if (Date.now() - (g.__pillarDaily ?? 0) < DAY_MS) return;
  g.__pillarDaily = Date.now();
  await purgeExpired();
  await unlinkInactiveEveryone();
}

export async function syncEveryone() {
  // A slow round must not overlap the next one and double every API call.
  if (g.__pillarSyncing) return { users: 0, skipped: true };
  g.__pillarSyncing = true;
  try {
    const users = await activeUsers();
    for (const u of users) {
      try {
        await runAsUser(u.id, u.timezone, backgroundSync);
      } catch (e) {
        // One person's dead connection must not stop everyone else's sync.
        console.error("[pillar] background sync failed for one user:", e instanceof Error ? e.message : e);
      }
    }
    sweepEmptyDbs(new Set((await allUsers()).map((u) => u.id)));
    await dailyChores();
    return { users: users.length, skipped: false };
  } finally {
    g.__pillarSyncing = false;
  }
}

export function startScheduler() {
  if (g.__pillarScheduler || process.env.PILLAR_SCHEDULER === "off") return;
  g.__pillarScheduler = true;
  const run = () => void syncEveryone().catch((e) => console.error("[pillar] sync round failed:", e));
  setTimeout(run, FIRST_RUN_MS).unref?.();
  setInterval(run, TICK_MS).unref?.();
  setInterval(() => void remindEveryone().catch((e) => console.error("[pillar] reminder round failed:", e)), REMIND_MS).unref?.();
}
