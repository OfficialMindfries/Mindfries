import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE, sessionSecret, signSession } from "@/lib/auth/session";
import { OAUTH_STATE_COOKIE, readOAuthState } from "@/lib/auth/oauth-state";
import { exchangeCode, isConfigured, isOAuthProvider, OAUTH_PROVIDERS } from "@/lib/auth/oauth-providers";
import { signInWithOAuth } from "@/lib/auth/oauth-login";

/**
 * GET /api/auth/oauth/{provider}/callback — where the provider sends the
 * browser back after the candidate approves (or denies) the consent screen.
 *
 * Every failure here redirects to /login with a plain-English ?social_error=
 * reason instead of rendering an error page of its own — the login page is
 * already the right place to show it, next to the same buttons that started
 * this.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const loginError = (reason: string) => NextResponse.redirect(new URL(`/login?social_error=${reason}`, url.origin));

  if (!isOAuthProvider(provider)) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const jar = await cookies();
  const stateCookie = jar.get(OAUTH_STATE_COOKIE)?.value;
  // Consumed on first use either way — a callback is only ever valid once.
  jar.delete(OAUTH_STATE_COOKIE);

  const providerError = url.searchParams.get("error");
  if (providerError) {
    // The candidate hit "Cancel" on the consent screen, or the provider
    // itself refused — either way this is the normal path back, not a bug.
    return loginError(`${provider}_denied`);
  }

  const secret = sessionSecret();
  const stateParam = url.searchParams.get("state") ?? "";
  const state = await readOAuthState(stateCookie, stateParam, secret);
  if (!state || state.provider !== provider) {
    return loginError(`${provider}_state_mismatch`);
  }

  const code = url.searchParams.get("code");
  if (!code) return loginError(`${provider}_no_code`);
  if (!isConfigured(provider) || !secret) return loginError(`${provider}_not_configured`);

  const redirectUri = new URL(`/api/auth/oauth/${provider}/callback`, url.origin).toString();

  try {
    const accessToken = await exchangeCode(provider, { code, redirectUri });
    const profile = await OAUTH_PROVIDERS[provider].fetchProfile(accessToken);
    const result = await signInWithOAuth(provider, profile);
    if (!result.ok) {
      return NextResponse.redirect(
        new URL(`/login?social_error=${provider}_refused&social_message=${encodeURIComponent(result.error)}`, url.origin),
      );
    }

    const response = NextResponse.redirect(new URL(state.next, url.origin));
    response.cookies.set(SESSION_COOKIE, await signSession(result.session, secret), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "sign-in failed";
    return NextResponse.redirect(
      new URL(`/login?social_error=${provider}_failed&social_message=${encodeURIComponent(message)}`, url.origin),
    );
  }
}
