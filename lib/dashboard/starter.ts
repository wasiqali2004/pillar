import "server-only";
import { goals, habits, surahProgress } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { ALL_SURAHS } from "@/lib/widgets/deen/surahs";
import type { Answers } from "./catalog";

/**
 * What a brand-new account starts with, so the first look at the dashboard is
 * something to tap rather than a page of empty boxes. Only structure, never
 * numbers: no fake logs and no invented holdings. Everything here can be edited
 * or removed, and it only runs on an empty account.
 */
export async function addStarterContent(a: Answers) {
  const muslim = a.faith === "muslim" || a.why.includes("deen");
  const wants = (w: Answers["why"][number]) => a.why.length === 0 || a.why.includes(w);

  const [anyHabit] = await db.select({ id: habits.id }).from(habits).limit(1);
  if (!anyHabit) {
    const list: { name: string; cadence: "daily" | "x_per_week"; targetCount: number }[] = [];
    if (muslim) list.push({ name: "Read some Qur'an", cadence: "daily", targetCount: 1 });
    if (wants("fitness")) list.push({ name: "Gym", cadence: "x_per_week", targetCount: 3 });
    if (wants("health")) list.push({ name: "Walk 8,000 steps", cadence: "daily", targetCount: 1 });
    if (wants("habits")) list.push({ name: "Read 10 pages", cadence: "daily", targetCount: 1 });
    if (wants("mind")) list.push({ name: "No phone in bed", cadence: "daily", targetCount: 1 });
    if (list.length) await db.insert(habits).values(list.map((h, i) => ({ ...h, sortOrder: i })));
  }

  const [anyGoal] = await db.select({ id: goals.id }).from(goals).limit(1);
  if (!anyGoal) {
    const list: (typeof goals.$inferInsert)[] = [];
    if (muslim) {
      list.push({ title: "All 5 prayers, every day", metric: "prayers", targetValue: 150, unit: "prayers", period: "month", direction: "at_least" });
    }
    if (wants("fitness")) {
      list.push({ title: "12 workouts a month", metric: "workouts", targetValue: 12, unit: "workouts", period: "month", direction: "at_least" });
    }
    if (list.length) await db.insert(goals).values(list.map((g, i) => ({ ...g, sortOrder: i })));
  }

  if (muslim) {
    const [anySurah] = await db.select({ id: surahProgress.id }).from(surahProgress).limit(1);
    if (!anySurah) {
      // The ones most people already know or start with.
      const start = [1, 114, 113, 112, 108, 103, 67];
      await db.insert(surahProgress).values(
        start.map((n, i) => {
          const s = ALL_SURAHS.find((x) => x.number === n)!;
          return { surahNumber: s.number, name: s.name, ayahCount: s.ayahs, sortOrder: i };
        }),
      );
    }
  }
}
