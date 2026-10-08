import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentCandidate } from "@/lib/auth/users";
import { siteUrl } from "@/lib/auth/email-links";
import { composioReady, isConnectPlatform, startConnection } from "@/lib/composio";
import { CONNECT_COOKIE, profileRedirect } from "@/lib/profile/connect";

/**
 * GET /api/connect/{platform}/start
 *
 * Sends a signed-in candidate to the platform's own sign-in (hosted by
 * Composio) to prove the account is theirs. The connection it will create
 * is remembered in a short-lived cookie, so the callback asks Composio about
 * the sign-in this browser started and not one named in a URL.
 */
export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isConnectPlatform(platform)) return NextResponse.json({ error: "unknown platform" }, { status: 404 });

  const candidate = await currentCandidate();
  if (!candidate) return NextResponse.redirect(new URL("/login?next=/profile", request.url));
  if (!composioReady()) return profileRedirect(request, platform, "not_configured");

  // Where Composio sends the browser back. Built from this site's known
  // address, not from the request's Host header (see siteUrl).
  const site = await siteUrl();
  if (!site) return profileRedirect(request, platform, "not_configured");

  try {
    const { redirectUrl, connectedAccountId } = await startConnection(platform, candidate.id, `${site}/api/connect/${platform}/callback`);
    const jar = await cookies();
    jar.set(CONNECT_COOKIE, `${platform}:${connectedAccountId}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/connect",
      maxAge: 15 * 60,
    });
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("connect: couldn't start a sign-in:", err);
    return profileRedirect(request, platform, "failed");
  }
}
