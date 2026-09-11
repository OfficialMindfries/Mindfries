import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE, sessionSecret } from "@/lib/auth/session";

// The gate in front of /admin.
//
// It only verifies the signed cookie — no database call, no password work — so
// it stays cheap and runs on the Edge runtime. Whether the account still
// exists is settled at sign-in and again by the layout; this is the first
// check, not the only one.
//
// Fails closed: no SESSION_SECRET means no valid session, which means nobody
// gets in. A gate that opens when misconfigured isn't a gate.

export async function middleware(req: NextRequest) {
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret());

  if (session) {
    // Someone already signed in has no use for the login page.
    if (req.nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  if (req.nextUrl.pathname === "/login") return NextResponse.next();

  const login = new URL("/login", req.url);
  // Come back to where they were headed, but only ever to a path on this site:
  // an absolute URL here would turn the login page into an open redirect.
  const wanted = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (wanted !== "/admin") login.searchParams.set("next", wanted);
  const res = NextResponse.redirect(login);
  // Clear a cookie that failed to verify, so an expired session doesn't sit
  // there being re-checked on every request.
  if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  // /admin and everything under it, plus /login so a signed-in admin is sent
  // onward. The cron and webhook routes carry their own secrets and are not
  // behind a human login.
  matcher: ["/admin/:path*", "/admin", "/login"],
};
