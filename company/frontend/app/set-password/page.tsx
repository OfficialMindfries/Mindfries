import { LoginBlobs } from "@/components/login/LoginBlobs";
import { lookupInvite } from "@/lib/auth/company-users";
import { SetPasswordForm } from "./SetPasswordForm";

export const dynamic = "force-dynamic";

/**
 * Where every invite link lands — the ops-created first admin (extending
 * internal-admin's onboarding, IMPLEMENTATION.md §3.6) and a teammate
 * invited from /settings/team (Phase 4) both go through this same page.
 * Nobody, including Mindfries ops, ever sets a company account's password
 * on its behalf — this is the only place one gets set.
 */
export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const invite = await lookupInvite(token);

  return (
    <div className="ambient relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <LoginBlobs />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
          <img src="/mindfries-logo.svg" alt="" width={34} height={34} />
          <div>
            <div className="text-[19px] font-extrabold tracking-tight">Mindfries</div>
            <div className="eyebrow -mt-0.5">Company Portal</div>
          </div>
        </div>

        {invite.ok ? (
          <>
            <p className="mb-5 max-w-xs text-center text-sm text-dim">
              Set a password for <span className="font-semibold text-ink">{invite.email}</span>
              {invite.companyName && <> at {invite.companyName}</>}.
            </p>
            <SetPasswordForm token={token ?? ""} />
          </>
        ) : (
          <p role="alert" className="max-w-sm rounded-xl bg-[#fdecef] px-4 py-3 text-center text-sm leading-relaxed text-[#a6203c]">
            {invite.error}
          </p>
        )}
      </div>
    </div>
  );
}
