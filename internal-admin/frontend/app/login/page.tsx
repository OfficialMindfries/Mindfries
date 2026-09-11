import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only a path on this site survives; anything else falls back to /admin, so
  // a crafted ?next= can't bounce someone off to another origin after login.
  const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "";

  return (
    <div className="ambient grid min-h-screen place-items-center p-6">
      <div className="panel w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mindfries-logo.svg" alt="" width={36} height={36} className="shrink-0" />
          <div>
            <div className="text-base font-extrabold tracking-tight">Mindfries</div>
            <div className="eyebrow mt-0.5">Internal Admin</div>
          </div>
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-dim">Mindfries team access only.</p>

        <LoginForm next={safeNext} />

        <p className="mt-5 text-center text-xs text-faint">
          Accounts are added by an admin. Locked out? Ask someone with access to add you.
        </p>
      </div>
    </div>
  );
}
