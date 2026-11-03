import "server-only";
import { BRAND } from "@/lib/brand";

/**
 * Sends account emails. Uses Resend's HTTP API when RESEND_API_KEY is set.
 * Without it nothing can be emailed, so on a local install the link goes to the
 * server's console, and in production the pages say so honestly.
 */
export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function send(to: string, subject: string, text: string, link: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") console.log(`[pillar] ${subject} for ${to}: ${link}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? `${BRAND.name} <onboarding@resend.dev>`,
        to,
        subject,
        text,
      }),
    });
    // The pages answer the same either way so they can't reveal who has an
    // account, which makes the log the only place a failed send can show up.
    if (!res.ok) console.error(`[pillar] email failed: Resend answered ${res.status}`);
    return res.ok;
  } catch (e) {
    console.error("[pillar] email failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

export function sendResetEmail(to: string, link: string) {
  return send(
    to,
    `Reset your ${BRAND.name} password`,
    `Someone asked to reset the password for this ${BRAND.name} account.\n\nReset it here (the link works once, for one hour):\n${link}\n\nIf this wasn't you, you can ignore this email.`,
    link,
  );
}

export function sendVerifyEmail(to: string, link: string) {
  return send(
    to,
    `Confirm your email for ${BRAND.name}`,
    `Welcome to ${BRAND.name}. Confirm this is your email here (the link works for 7 days):\n${link}\n\nIf you didn't create this account, you can ignore this email.`,
    link,
  );
}
