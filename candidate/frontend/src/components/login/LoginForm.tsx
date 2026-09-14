"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { GithubMark, GitlabMark, GoogleMark, LinkedinMark } from "@/components/icons/BrandIcon";
import { signIn, type LoginState } from "@/app/login/actions";
import type { OAuthProviderId } from "@/lib/auth/oauth-providers";

const SOCIAL = [
  { id: "google", label: "Google", icon: GoogleMark },
  { id: "github", label: "GitHub", icon: GithubMark },
  { id: "gitlab", label: "GitLab", icon: GitlabMark },
  { id: "linkedin", label: "LinkedIn", icon: LinkedinMark },
] as const;

const SUPPORT_EMAIL = "officemindfries@gmail.com";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tone="primary" size="lg" className="w-full !rounded-full" disabled={pending}>
      {pending ? "Signing in…" : "Login"}
    </Button>
  );
}

/**
 * A real account check now (checkCredentials, against candidate_users) —
 * see lib/auth/users.ts. The four social buttons are real OAuth now too
 * (lib/auth/oauth-*.ts, /api/auth/oauth/[provider]/{start,callback}) — but
 * only *per provider*, gated on that provider's own CLIENT_ID/CLIENT_SECRET.
 * `configuredProviders` is decided server-side (login/page.tsx, an env
 * check) and handed down as data: a configured button is a real link into
 * the OAuth flow, an unconfigured one still says so plainly rather than
 * linking somewhere that would 404.
 */
export function LoginForm({
  next,
  configuredProviders,
  socialError,
}: {
  next: string;
  configuredProviders: OAuthProviderId[];
  socialError: string | null;
}) {
  const [state, action] = useActionState<LoginState, FormData>(signIn, { error: null });
  const [socialNotice, setSocialNotice] = useState<string | null>(socialError);

  return (
    <div className="w-full max-w-sm">
      <form action={action} className="space-y-3.5">
        {next && <input type="hidden" name="next" value={next} />}

        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          placeholder="you@company.com"
          className="w-full rounded-xl border border-[#B3CFE5] bg-white px-4 py-3 text-[14px] text-[#0A1931] outline-none transition placeholder:text-[#4A7FA7]/70 focus:border-[#1A3D63]"
        />
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Password"
          className="w-full rounded-xl border border-[#B3CFE5] bg-white px-4 py-3 text-[14px] text-[#0A1931] outline-none transition placeholder:text-[#4A7FA7]/70 focus:border-[#1A3D63]"
        />

        {state.error && (
          <p role="alert" className="text-center text-[12.5px] text-[#a6203c]">
            {state.error}
          </p>
        )}

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="block text-center text-[12.5px] text-[#4A7FA7] hover:text-[#1A3D63] hover:underline"
        >
          Having trouble logging in?
        </a>

        <Submit />

        <p className="text-center text-[12px] text-[#4A7FA7]">
          Need an account?{" "}
          <Link href="/signup" className="font-medium text-[#1A3D63] hover:underline">
            Sign up
          </Link>
        </p>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-[#B3CFE5]" />
        <span className="text-[11.5px] font-medium text-[#4A7FA7]">Or continue with</span>
        <span className="h-px flex-1 bg-[#B3CFE5]" />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {SOCIAL.map(({ id, label, icon: Icon }) => {
          const buttonClass =
            "flex items-center justify-center gap-2 rounded-xl border border-[#B3CFE5] bg-white py-2.5 text-[13px] font-medium text-[#0A1931] transition-colors hover:bg-[#B3CFE5]/15";
          if (configuredProviders.includes(id)) {
            const href = `/api/auth/oauth/${id}/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;
            return (
              <a key={id} href={href} className={buttonClass}>
                <Icon size={15} />
                {label}
              </a>
            );
          }
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSocialNotice(`${label} sign-in isn't connected yet — use email above for now.`)}
              className={buttonClass}
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>

      {socialNotice && (
        <p role="status" className="mt-3 text-center text-[12px] text-[#4A7FA7]">
          {socialNotice}
        </p>
      )}
    </div>
  );
}
