import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Where a request is sent when its session's signature is good but the
 * account has withdrawn it (lib/auth/revocation.ts).
 *
 * The middleware only checks signatures, so it would bounce such a browser
 * from /login straight back to /dashboard, forever. Clearing the cookie here
 * first is what lets the sign-in page be reached. A page can't clear it
 * itself: only a route handler or an action may change cookies.
 */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?ended=1", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
