import { db } from "@/lib/db";
import { prayerLogs } from "@/lib/db/schema";
import { getPlan } from "@/lib/dashboard/prefs";
import { isPaid } from "@/lib/dashboard/catalog";
import { localDate } from "@/lib/date";
import type { Prayer } from "@/lib/tree/model";
import { PrayerTree } from "@/components/tree/PrayerTree";

export const dynamic = "force-dynamic";

export const metadata = { title: "Prayer Tree" };

/**
 * The Prayer Tree: a Pro feature. Free users still see their own tree, blurred
 * behind the upgrade card, because "you already have 40 leaves" sells it
 * better than a picture of someone else's.
 */
export default async function TreePage() {
  const [plan, logs] = await Promise.all([
    getPlan(),
    db.select({ date: prayerLogs.localDate, prayer: prayerLogs.prayer }).from(prayerLogs),
  ]);
  const today = localDate();

  const prayed: Record<string, Prayer[]> = {};
  for (const l of logs) (prayed[l.date] ??= []).push(l.prayer);
  const first = Object.keys(prayed).sort()[0];
  const start = first && first < today ? first : today;

  return <PrayerTree start={start} today={today} prayed={prayed} plan={plan} locked={!isPaid(plan)} />;
}
