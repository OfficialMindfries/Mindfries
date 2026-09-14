import type { Metadata } from "next";
import { LoginBlobs } from "@/components/login/LoginBlobs";
import { LoginForm } from "@/components/login/LoginForm";
import { isConfigured, OAUTH_PROVIDER_ORDER } from "@/lib/auth/oauth-providers";

export const metadata: Metadata = {
  title: "Sign in · Mindfries",
  description: "Sign in to your Mindfries candidate workspace.",
};

export const dynamic = "force-dynamic";

/**
 * The candidate portal's entry point, shaped after the supplied reference —
 * centred form, no card border, scattered decorative shapes — redrawn in
 * this app's own palette. Real now: LoginForm submits to lib/auth/users.ts's
 * checkCredentials against candidate_users.
 *
 * The four social buttons are real OAuth now too (lib/auth/oauth-*.ts) —
 * *per provider*, gated on that provider's own CLIENT_ID/CLIENT_SECRET being
 * set. Which providers are actually configured is an env check, decided here
 * on the server and handed down as data, not guessed client-side — a button
 * for an unconfigured provider still renders, but as the same honest "isn't
 * connected yet" notice as before, never a link that would 404 or bounce
 * through a provider with no app registered.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; social_error?: string; social_message?: string }>;
}) {
  const { next, social_error, social_message } = await searchParams;
  // Only a path on this site survives; anything else falls back to /dashboard,
  // so a crafted ?next= can't bounce someone off to another origin after login.
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "";

  const configuredProviders = OAUTH_PROVIDER_ORDER.filter((id) => isConfigured(id));
  const socialError =
    typeof social_error === "string" && social_error
      ? (typeof social_message === "string" && social_message) || humanizeSocialError(social_error)
      : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F6FAFD] px-6 py-16">
      <LoginBlobs />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
          <img src="/mindfries-logo.svg" alt="" width={34} height={34} />
          <span className="text-[22px] font-semibold tracking-tight text-[#0A1931]">Mindfries</span>
        </div>

        <LoginForm next={safeNext} configuredProviders={configuredProviders} socialError={socialError} />
      </div>
    </div>
  );
}

/** A plain-English fallback for the error codes the OAuth callback route redirects with, when it didn't already attach its own ?social_message=. */
function humanizeSocialError(code: string): string {
  if (code.endsWith("_denied")) return "Sign-in was cancelled.";
  if (code.endsWith("_not_configured")) return "That sign-in option isn't set up yet — use email above for now.";
  if (code.endsWith("_state_mismatch") || code.endsWith("_no_code")) return "That sign-in link expired — try again.";
  return "That sign-in attempt didn't work — try again, or use email above.";
}
