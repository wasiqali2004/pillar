import Link from "next/link";
import { buildWeeklyReview } from "@/lib/rafiq/review";
import { ReviewView } from "@/components/review/ReviewView";
import { rafiqConfigured } from "@/lib/rafiq/agent";
import { getPlan } from "@/lib/dashboard/prefs";
import { isPaid } from "@/lib/dashboard/catalog";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your week" };

/**
 * The weekly review. Every figure is counted from the user's own logs, so the
 * page is complete on its own — Rafiq's written summary is an extra on top,
 * not the thing that makes it work.
 */
export default async function ReviewPage() {
  const [review, plan] = await Promise.all([buildWeeklyReview(), getPlan()]);

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-6 sm:px-7 sm:py-8">
      <Link href="/app" className="text-[0.72rem] text-faint hover:text-teal">
        ← Dashboard
      </Link>
      <ReviewView
        review={review}
        canAskRafiq={isPaid(plan) && rafiqConfigured()}
      />
    </main>
  );
}
