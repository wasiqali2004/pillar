"use server";

import { revalidatePath } from "next/cache";
import { saveLayout, saveOnboarding, savePlan } from "./prefs";
import type { Answers, LayoutItem, PlanId } from "./catalog";
import type { PrayerSettings } from "@/lib/prayer-options";

export async function completeOnboardingAction(answers: Answers, items: LayoutItem[], plan: PlanId, prayer?: PrayerSettings | null) {
  await saveOnboarding(answers, items, plan, prayer);
  revalidatePath("/app");
}

/**
 * Customize mode saves on every change. Revalidating re-renders the page so a
 * newly added widget arrives with its data, not as an empty slot.
 */
export async function saveLayoutAction(items: LayoutItem[]) {
  const clean = await saveLayout(items, "user");
  revalidatePath("/app");
  return clean;
}

export async function setPlanAction(plan: PlanId) {
  const clean = await savePlan(plan);
  revalidatePath("/app");
  return clean;
}
