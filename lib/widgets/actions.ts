"use server";

import { revalidatePath } from "next/cache";
import type { PrayerName } from "@/lib/db/schema";
import {
  toggleHabit,
  createHabit,
  updateHabit,
  deleteHabit,
} from "./habits/queries";
import { togglePrayer } from "./prayers";
import { cycleSurah, addSurah, removeSurah } from "./deen";
import { logBody } from "./body";
import { logSleep } from "./sleep";
import { addMoney } from "./money";
import {
  createGoal,
  updateGoal,
  stepGoal,
  deleteGoal,
} from "./goals/mutations";
import { saveHolding, removeHolding, type HoldingInput } from "./portfolio/mutations";

/**
 * Every mutation the dashboard can make, in one place. Each one delegates to
 * the widget that owns the data — the widget keeps the logic, this file just
 * marks the server boundary and revalidates.
 */

export async function toggleHabitAction(habitId: number) {
  const r = await toggleHabit(habitId, "ui");
  revalidatePath("/app");
  return r;
}

export async function togglePrayerAction(prayer: PrayerName) {
  const r = await togglePrayer(prayer, "ui");
  revalidatePath("/app");
  return r;
}

export async function cycleSurahAction(surahNumber: number) {
  const r = await cycleSurah(surahNumber);
  revalidatePath("/app");
  return r;
}

export async function logBodyAction(input: {
  steps?: number | null;
  sleepMinutes?: number | null;
  weightGrams?: number | null;
}) {
  const r = await logBody(input, "ui");
  revalidatePath("/app");
  return r;
}

export async function addMoneyAction(input: {
  amountCents: number;
  direction: "in" | "out";
  category?: string | null;
  note?: string | null;
}) {
  const r = await addMoney(input, "ui");
  revalidatePath("/app");
  return r;
}

export async function logSleepAction(input: {
  date?: string;
  minutes?: number | null;
  score?: number | null;
}) {
  const r = await logSleep(input, "ui");
  revalidatePath("/app");
  return r;
}

export async function addSurahAction(surahNumber: number) {
  const r = await addSurah(surahNumber);
  revalidatePath("/app");
  return r;
}

export async function removeSurahAction(surahNumber: number) {
  const r = await removeSurah(surahNumber);
  revalidatePath("/app");
  return r;
}

export async function createHabitAction(input: Parameters<typeof createHabit>[0]) {
  const r = await createHabit(input);
  revalidatePath("/app");
  return r;
}

export async function updateHabitAction(
  habitId: number,
  input: Parameters<typeof updateHabit>[1],
) {
  const r = await updateHabit(habitId, input);
  revalidatePath("/app");
  return r;
}

export async function deleteHabitAction(habitId: number) {
  const r = await deleteHabit(habitId);
  revalidatePath("/app");
  return r;
}

export async function createGoalAction(input: Parameters<typeof createGoal>[0]) {
  const r = await createGoal(input);
  revalidatePath("/app");
  return r;
}

export async function updateGoalAction(
  goalId: number,
  input: Parameters<typeof updateGoal>[1],
) {
  const r = await updateGoal(goalId, input);
  revalidatePath("/app");
  return r;
}

export async function stepGoalAction(goalId: number, delta: 1 | -1) {
  const r = await stepGoal(goalId, delta === -1 ? -1 : 1);
  revalidatePath("/app");
  return r;
}

export async function deleteGoalAction(goalId: number) {
  const r = await deleteGoal(goalId);
  revalidatePath("/app");
  return r;
}

export async function saveHoldingAction(input: HoldingInput) {
  const r = await saveHolding(input);
  revalidatePath("/app");
  return r;
}

export async function removeHoldingAction(symbol: string) {
  await removeHolding(symbol);
  revalidatePath("/app");
}
