"use client";

import { useState, useTransition } from "react";
import { resendVerificationAction } from "@/lib/auth/actions";

/** Shown across the app until the address is confirmed. Only when email can actually be sent. */
export function VerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sent" | "failed">("idle");
  const [pending, start] = useTransition();
  return (
    <div className="auth-notice mx-auto mt-3 w-[calc(100%-2.5rem)] max-w-[1800px]" role="status">
      Confirm your email to use Rafiq. The link went to <b>{email}</b>.{" "}
      {state === "idle" && (
        <button
          type="button"
          className="text-teal hover:underline"
          disabled={pending}
          onClick={() => start(async () => setState((await resendVerificationAction()).sent ? "sent" : "failed"))}
        >
          {pending ? "Sending…" : "Send it again"}
        </button>
      )}
      {state === "sent" && <span className="text-teal">Sent. Check your inbox.</span>}
      {state === "failed" && <span className="text-muted">Couldn&apos;t send that just now. Try again in a few minutes.</span>}
    </div>
  );
}
