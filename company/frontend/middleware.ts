import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE, sessionSecret } from "@/lib/auth/session";

// The gate in front of every company-portal page. Same shape as
// internal-admin's middleware.ts: cookie-only, no database call, Edge-safe.
// Whether the account still exists/is active is settled again at sign-in and
// by the portal layout; this is the first check, not the only one.
//
// Fails closed: no SESSION_SECRET means no valid session, which means
// nobody gets in.

const PUBLIC_PATHS = ["/login", "/set-password"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret());
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (session) {
    // Someone already signed in has no use for the login page.
    if (pathname === "/login") return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  if (isPublic) return NextResponse.next();

  const login = new URL("/login", req.url);
  // Come back to where they were headed, but only ever to a path on this
  // site: an absolute URL here would turn the login page into an open
  // redirect.
  const wanted = `${pathname}${req.nextUrl.search}`;
  if (wanted !== "/dashboard") login.searchParams.set("next", wanted);
  const res = NextResponse.redirect(login);
  // Clear a cookie that failed to verify, so an expired session doesn't sit
  // there being re-checked on every request.
  if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/dashboard", "/roles/:path*", "/roles", "/candidates/:path*", "/candidates", "/settings/:path*", "/login", "/set-password"],
};
