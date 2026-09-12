"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { GithubMark, GitlabMark, GoogleMark, LinkedinMark } from "@/components/icons/BrandIcon";

const SOCIAL = [
  { id: "google", label: "Google", icon: GoogleMark },
  { id: "github", label: "GitHub", icon: GithubMark },
  { id: "gitlab", label: "GitLab", icon: GitlabMark },
  { id: "linkedin", label: "LinkedIn", icon: LinkedinMark },
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT_EMAIL = "officemindfries@gmail.com";

/**
 * There's no candidate login yet (no accounts table, no session — the
 * account menu's own doc comment says the same thing about "Sign out").
 * Building a real credential check or real OAuth against four providers
 * both need infrastructure that doesn't exist here, so neither is faked:
 *
 * - The form validates for real (required fields, a real email shape) and,
 *   once valid, goes straight to the dashboard — the one real destination
 *   this app has — with no fake "verifying…" delay, because nothing is
 *   actually being verified.
 * - Each social button says plainly that it isn't connected yet rather than
 *   doing nothing (a dead button) or pretending to sign in.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [socialNotice, setSocialNotice] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSocialNotice(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("That doesn't look like an email address.");
      return;
    }
    setError(null);
    router.push("/dashboard");
  }

  return (
    <div className="w-full max-w-sm">
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          placeholder="you@company.com"
          autoComplete="username"
          className="w-full rounded-xl border border-[#B3CFE5] bg-white px-4 py-3 text-[14px] text-[#0A1931] outline-none transition placeholder:text-[#4A7FA7]/70 focus:border-[#1A3D63]"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          placeholder="Password"
          autoComplete="current-password"
          className="w-full rounded-xl border border-[#B3CFE5] bg-white px-4 py-3 text-[14px] text-[#0A1931] outline-none transition placeholder:text-[#4A7FA7]/70 focus:border-[#1A3D63]"
        />

        {error && <p className="text-center text-[12.5px] text-[#a6203c]">{error}</p>}

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="block text-center text-[12.5px] text-[#4A7FA7] hover:text-[#1A3D63] hover:underline"
        >
          Having trouble logging in?
        </a>

        <Button type="submit" tone="primary" size="lg" className="w-full !rounded-full">
          Login
        </Button>

        <p className="text-center text-[12px] text-[#4A7FA7]">
          Accounts are created when a company invites you to an assessment.
        </p>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-[#B3CFE5]" />
        <span className="text-[11.5px] font-medium text-[#4A7FA7]">Or continue with</span>
        <span className="h-px flex-1 bg-[#B3CFE5]" />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {SOCIAL.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSocialNotice(`${label} sign-in isn't connected yet — use email above for now.`)}
            className="flex items-center justify-center gap-2 rounded-xl border border-[#B3CFE5] bg-white py-2.5 text-[13px] font-medium text-[#0A1931] transition-colors hover:bg-[#B3CFE5]/15"
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {socialNotice && (
        <p role="status" className="mt-3 text-center text-[12px] text-[#4A7FA7]">
          {socialNotice}
        </p>
      )}
    </div>
  );
}
