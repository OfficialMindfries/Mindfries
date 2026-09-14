import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sessionSecret } from "@/lib/auth/session";
import { OAUTH_STATE_COOKIE, randomNonce, signOAuthState } from "@/lib/auth/oauth-state";
import { buildAuthorizeUrl, isConfigured, isOAuthProvider } from "@/lib/auth/oauth-providers";

/**
 * GET /api/auth/oauth/{provider}/start?next=/dashboard
 *
 * Redirects the browser to the provider's own consent screen. LoginForm only
 * ever links here for a provider it already knows is configured (see
 * login/page.tsx), but this route re-checks independently — a link is just
 * HTML a browser follows, never a substitute for the server's own guard.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);

  if (!isOAuthProvider(provider)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  if (!isConfigured(provider)) {
    return NextResponse.redirect(new URL(`/login?social_error=${provider}_not_configured`, url.origin));
  }
  const secret = sessionSecret();
  if (!secret) {
    return NextResponse.redirect(new URL("/login?social_error=session_secret_missing", url.origin));
  }

  const nextParam = url.searchParams.get("next") ?? "";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  const nonce = randomNonce();
  const state = await signOAuthState({ provider, next, nonce }, secret);

  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  const redirectUri = new URL(`/api/auth/oauth/${provider}/callback`, url.origin).toString();
  const authorizeUrl = buildAuthorizeUrl(provider, { redirectUri, state: nonce });
  return NextResponse.redirect(authorizeUrl);
}
