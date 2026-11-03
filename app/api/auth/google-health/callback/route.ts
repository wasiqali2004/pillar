import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, healthConfig, syncHealth } from "@/lib/health/google-health";
import { STATE_COOKIE } from "../route";

/** Where Google sends the browser back. Must match the client's redirect URI. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const home = new URL("/app", url.origin);
  const connections = new URL("/app/connect", url.origin);

  const back = (status: string) => {
    // Good news goes straight to the numbers; anything else goes where it can be explained and retried.
    const target = status === "connected" ? home : connections;
    target.searchParams.set("health", status);
    const res = NextResponse.redirect(target);
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  // The user hit "cancel" on Google's consent screen.
  if (url.searchParams.get("error")) return back("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !expected || state !== expected) {
    return back("invalid");
  }

  const cfg = healthConfig();
  if (!cfg) return back("unconfigured");

  try {
    await exchangeCode(cfg, code);
  } catch {
    return back("failed");
  }

  // Backfill immediately so the tile has something to show on the way home.
  // A sync failure here is not a connection failure — the tokens are good.
  try {
    await syncHealth(90);
  } catch {}

  return back("connected");
}
