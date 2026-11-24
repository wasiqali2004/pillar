"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "pillar.reminderNudgeDismissed";

/** One line on the dashboard. Settings is where it's done, and once dismissed it stays gone. */
export function ReminderNudge({ kind }: { kind: "prayers" | "habits" }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch {}
    if (dismissed || !("Notification" in window) || Notification.permission !== "default") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only known in the browser
    setShow(true);
  }, []);

  if (!show) return null;
  return (
    <div className="auth-notice mb-3 flex flex-wrap items-center justify-between gap-2">
      <span>{kind === "prayers" ? "Want a nudge when each prayer comes in?" : "Want a nudge in the evening if habits are still open?"}</span>
      <span className="flex gap-3">
        <Link href="/app/settings#reminders" className="text-teal hover:underline">
          Set up reminders
        </Link>
        <button
          type="button"
          className="text-muted hover:text-ink"
          onClick={() => {
            setShow(false);
            try {
              localStorage.setItem(KEY, "1");
            } catch {}
          }}
        >
          Not now
        </button>
      </span>
    </div>
  );
}
