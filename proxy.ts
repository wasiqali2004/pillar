import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "pillar_session";

/**
 * The fast first check: no session cookie, no entry. It only looks for the
 * cookie's presence. Whether the cookie is valid is decided on the server when
 * the page or route actually runs, and the database refuses to open without a
 * real session, so this is about a clean redirect rather than the security.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/app/:path*",
    "/welcome",
    "/quran/:path*",
    "/connect-money",
    "/api/rafiq",
    "/api/plaid/:path*",
    "/api/quran/:path*",
    "/api/auth/:path*",
    "/api/account/:path*",
  ],
};
