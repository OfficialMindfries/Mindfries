import { NextResponse, type NextRequest } from "next/server";
import { confirmEmail } from "@/lib/auth/email-links";

/**
 * Where the link in the confirmation email lands. It confirms the address
 * and sends the person on — to the dashboard, which shows the result (and
 * asks them to sign in first if they aren't).
 *
 * The redirect target is a fixed path on this site; nothing from the
 * request decides where it goes.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const ok = await confirmEmail(token);
  const res = NextResponse.redirect(new URL(`/dashboard?email=${ok ? "confirmed" : "link_expired"}`, req.url));
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
