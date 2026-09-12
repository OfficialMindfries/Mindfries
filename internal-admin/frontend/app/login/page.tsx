import { LoginBlobs } from "@/components/login/LoginBlobs";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

/**
 * Shaped after the same reference the candidate portal's /login now
 * follows — centred form, no card border, scattered decorative shapes,
 * a big pill button — redrawn here in the admin's own violet/coral rather
 * than the candidate app's blue. Only the visual layer changed: LoginForm
 * still submits to the same real signIn action (lib/auth/admins.ts,
 * scrypt against admin_users, root-admin fallback), untouched.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only a path on this site survives; anything else falls back to /admin, so
  // a crafted ?next= can't bounce someone off to another origin after login.
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "";

  return (
    <div className="ambient relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <LoginBlobs />

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
          <img src="/mindfries-logo.svg" alt="" width={34} height={34} />
          <div>
            <div className="text-[19px] font-extrabold tracking-tight">Mindfries</div>
            <div className="eyebrow -mt-0.5">Internal Admin</div>
          </div>
        </div>

        <LoginForm next={safeNext} />

        <p className="mt-6 max-w-xs text-center text-xs text-faint">
          Accounts are added by an admin. Locked out? Ask someone with access to add you.
        </p>
      </div>
    </div>
  );
}
