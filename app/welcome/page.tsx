import type { Metadata } from "next";
import { getLayout, getOnboarding } from "@/lib/dashboard/prefs";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { requireUser } from "@/lib/auth/session";
import { getPrayerSettings } from "@/lib/widgets/prayers/settings";

export const metadata: Metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

/**
 * First-run setup, and "Redo setup" from Customize mode. On a redo the saved
 * answers and layout come back pre-filled, so nothing is lost by looking.
 */
export default async function Welcome() {
  await requireUser();
  const [onboarding, layout, prayer] = await Promise.all([getOnboarding(), getLayout(), getPrayerSettings()]);
  return <Onboarding initialAnswers={onboarding?.answers ?? null} initialLayout={layout} initialPrayer={prayer} />;
}
