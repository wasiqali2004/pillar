import "server-only";
import { userTz } from "@/lib/date";
import { loadHabits } from "@/lib/widgets/habits/queries";
import { getPrayerSettings } from "@/lib/widgets/prayers/settings";
import { getPrefs, getSent, getSubscriptions, saveSent, sendPush } from "./push";
import { checkinDue, checkinKey, duePrayers, type Reminder } from "./schedule";

/** Runs once a minute for each user, inside runAsUser. Most runs find nothing to do. */
export async function sendDueReminders(now = new Date()) {
  if ((await getSubscriptions()).length === 0) return;
  const prefs = await getPrefs();
  if (!prefs.prayers && !prefs.checkin) return;

  const tz = userTz();
  const sent = await getSent();
  const due: Reminder[] = [];

  if (prefs.prayers) {
    const settings = await getPrayerSettings();
    if (settings) due.push(...duePrayers(settings, now, tz));
  }

  let settled: string | null = null;
  const key = checkinKey(now, tz);
  if (prefs.checkin && !sent.includes(key) && checkinDue(prefs.checkinHour, now, tz)) {
    const { doneCount, totalCount } = await loadHabits();
    const left = totalCount - doneCount;
    if (left > 0) {
      due.push({
        key,
        title: "Evening check-in",
        body: left === 1 ? "One habit left today. You've got this." : `${left} habits left today. One at a time.`,
        tag: "checkin",
        url: "/app",
      });
    } else {
      // All done: nothing to say today, and nothing to re-check every minute.
      settled = key;
    }
  }

  const fresh = due.filter((r) => !sent.includes(r.key));
  if (fresh.length === 0 && !settled) return;

  // Recorded before sending: a missed reminder is better than a repeated one.
  await saveSent([...sent, ...fresh.map((r) => r.key), ...(settled ? [settled] : [])]);
  for (const r of fresh) await sendPush({ title: r.title, body: r.body, tag: r.tag, url: r.url });
}
