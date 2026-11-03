"use client";

import { useActionState, useState } from "react";
import { joinWaitlistAction } from "@/lib/auth/actions";
import { BRAND } from "@/lib/brand";

/** For anyone who reaches sign-up during the private beta without an invite. */
export function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlistAction, null);
  const [email, setEmail] = useState("");
  if (state?.notice) return <p role="status">{state.notice}</p>;
  return (
    <>
      <p>{BRAND.name} is in private beta. Have an invite code? Enter it below. No code? Join the waitlist:</p>
      <form action={action} className="mt-2 flex gap-2">
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email for the waitlist"
          className="cx-input min-w-0 flex-1"
        />
        <button type="submit" className="pill shrink-0" disabled={pending}>
          {pending ? "Joining…" : "Join"}
        </button>
      </form>
      {state?.error && (
        <p className="mt-1 text-bad" role="alert">
          {state.error}
        </p>
      )}
    </>
  );
}
