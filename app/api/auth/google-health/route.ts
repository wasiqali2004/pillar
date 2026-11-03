import { NextResponse } from "next/server";
import { buildAuthUrl, healthConfig } from "@/lib/health/google-health";

export const STATE_COOKIE = "gh_oauth_state";

/** Kicks off consent. Visit /api/auth/google-health to connect the watch. */
export async function GET() {
  const cfg = healthConfig();
  if (!cfg) {
    return NextResponse.json(
      {
        error:
          "Set GOOGLE_HEALTH_CLIENT_ID, GOOGLE_HEALTH_CLIENT_SECRET and " +
          "GOOGLE_HEALTH_REDIRECT_URI in .env.local first.",
      },
      { status: 501 },
    );
  }

  // Signed into a cookie and checked on the way back, so a link someone else
  // crafts can't complete a connection against this session.
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthUrl(cfg, state));

  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });

  return res;
}
