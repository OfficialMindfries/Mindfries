import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE, sessionSecret } from "@/lib/auth/session";

// The gate in front of the real candidate portal — ported from
// internal-admin's own middleware.ts, same mechanism.
//
// It only verifies the signed cookie — no database call, no password work —
// so it stays cheap and runs on the Edge runtime. Whether the account still
// exists is settled at sign-in; this is the first check, not the only one.
//
// Fails closed: no SESSION_SECRET means no valid session, which means nobody
// gets in. A gate that opens when misconfigured isn't a gate.
//
// The root `/` (the stock Next.js starter page) and /ide are deliberately
// NOT in the matcher below: `/` was never built into part of this product,
// and the workspace has its own session concept tied to an assessment
// invite rather than a candidate login — gating it here would be gating
// something this middleware doesn't actually understand.

export async function middleware(req: NextRequest) {
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret());
  const path = req.nextUrl.pathname;
  const isAuthPage = path === "/login" || path === "/signup";

  if (session) {
    // Someone already signed in has no use for the login or signup page.
    if (isAuthPage) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  if (isAuthPage) return NextResponse.next();

  const login = new URL("/login", req.url);
  // Come back to where they were headed, but only ever to a path on this
  // site: an absolute URL here would turn the login page into an open
  // redirect.
  const wanted = `${path}${req.nextUrl.search}`;
  if (wanted !== "/dashboard") login.searchParams.set("next", wanted);
  const res = NextResponse.redirect(login);
  // Clear a cookie that failed to verify, so an expired session doesn't sit
  // there being re-checked on every request.
  if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/dashboard", "/assessments/:path*", "/assessments", "/profile/:path*", "/profile", "/onboarding", "/login", "/signup"],
};
