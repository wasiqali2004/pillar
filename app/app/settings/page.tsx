import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/SettingsView";
import { requireUser } from "@/lib/auth/session";
import { userTz } from "@/lib/date";
import { getLayout, getOnboarding } from "@/lib/dashboard/prefs";
import { getPrefs, vapidPublicKey } from "@/lib/reminders/push";
import { getPrayerSettings } from "@/lib/widgets/prayers/settings";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [prayer, onboarding, layout, reminderPrefs] = await Promise.all([getPrayerSettings(), getOnboarding(), getLayout(), getPrefs()]);
  const ids = new Set((layout ?? []).map((i) => i.id));

  return (
    <SettingsView
      email={user.email}
      name={user.name}
      timezone={userTz()}
      prayer={prayer}
      showPrayer={onboarding?.answers.faith !== "other" || ids.has("deen") || ids.has("prayers")}
      isOwner={user.isOwner}
      reminders={{ publicKey: vapidPublicKey(), prefs: reminderPrefs }}
    />
  );
}
