import Link from "next/link";

/** Wrong prayer times are worse than none, so the tile asks instead of assuming a city. */
export function PrayerSetupPrompt() {
  return (
    <div className="mt-3 rounded-ctl border border-dashed border-line px-3 py-3 text-sm text-muted">
      <p>Prayer times depend on where you are.</p>
      <Link href="/app/settings#prayer" className="mt-1 inline-block text-teal hover:underline">
        Set your location →
      </Link>
    </div>
  );
}
