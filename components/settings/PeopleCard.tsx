"use client";

import { useState } from "react";

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="pill"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/** Counts only. Nobody's data is shown here, and the owner can't open it from this page. */
export function PeopleCard({
  accounts,
  activeWeek,
  rafiqMessages,
  inviteLink,
  waitlist,
}: {
  accounts: number;
  activeWeek: number;
  rafiqMessages: number;
  inviteLink: string | null;
  waitlist: string[];
}) {
  return (
    <article className="cx-card">
      <h2 className="font-semibold">People</h2>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        {[
          ["Accounts", accounts],
          ["Active this week", activeWeek],
          ["Rafiq messages this month", rafiqMessages],
        ].map(([k, v]) => (
          <div key={k}>
            <dd className="text-xl font-semibold tabular-nums">{v}</dd>
            <dt className="text-[0.72rem] leading-snug text-faint">{k}</dt>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {inviteLink && <Copy text={inviteLink} label="Copy invite link" />}
        {waitlist.length > 0 && <Copy text={waitlist.join(", ")} label={`Copy ${waitlist.length} waitlist email${waitlist.length === 1 ? "" : "s"}`} />}
      </div>
      {inviteLink === null && (
        <p className="mt-3 text-sm text-muted">Sign-ups are open: anyone can create an account.</p>
      )}
      {waitlist.length > 0 && (
        <ul className="mt-3 flex max-h-40 flex-col gap-1 overflow-y-auto text-sm text-muted">
          {waitlist.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
