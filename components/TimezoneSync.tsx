"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncTimezoneAction } from "@/lib/auth/actions";

/**
 * Keeps the app's day and times matching where the person actually is. If the
 * device's timezone differs from what the server has (they travelled, or this
 * browser's cookie expired), it updates and re-renders. Nothing for them to set.
 */
export function TimezoneSync({ known }: { known: string | null }) {
  const router = useRouter();

  useEffect(() => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!device) return;
    const cookie = document.cookie.match(/(?:^|; )pillar_tz=([^;]*)/)?.[1];
    if (device === known && cookie && decodeURIComponent(cookie) === device) return;
    void syncTimezoneAction(device).then(() => router.refresh());
  }, [known, router]);

  return null;
}
