import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentCandidate } from "@/lib/auth/users";
import { endConnection, identityOf, isConnectPlatform } from "@/lib/composio";
import { CONNECT_COOKIE, profileRedirect, recordVerifiedAccount } from "@/lib/profile/connect";

/**
 * GET /api/connect/{platform}/callback
 *
 * Where Composio returns the browser after the sign-in. Nothing in the
 * query string is believed: the connection is the one this browser started
 * (from the cookie), and Composio is asked directly whether it is active,
 * whose it is, and who signed in. Then the account is recorded as the
 * candidate's own, and the connection is deleted — see lib/composio.ts for
 * why it isn't kept.
 */
export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isConnectPlatform(platform)) return NextResponse.json({ error: "unknown platform" }, { status: 404 });

  const candidate = await currentCandidate();
  if (!candidate) return NextResponse.redirect(new URL("/login?next=/profile", request.url));

  const jar = await cookies();
  const pending = jar.get(CONNECT_COOKIE)?.value ?? "";
  jar.delete({ name: CONNECT_COOKIE, path: "/api/connect" });
  const [startedFor, connectedAccountId] = pending.split(":");
  if (startedFor !== platform || !connectedAccountId) return profileRedirect(request, platform, "expired");

  let outcome = "failed";
  try {
    const identity = await identityOf(platform, candidate.id, connectedAccountId);
    if (!identity) {
      outcome = "cancelled";
    } else {
      await recordVerifiedAccount(candidate.id, platform, identity);
      outcome = "verified";
    }
  } catch (err) {
    console.error("connect: couldn't confirm a sign-in:", err);
  }

  // Whatever happened, the access isn't kept.
  await endConnection(connectedAccountId);
  return profileRedirect(request, platform, outcome);
}
