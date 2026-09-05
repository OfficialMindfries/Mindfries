// Shown on Tracker surfaces until the officemindfries backend env is wired.
// Server component — reads env directly.
export function SetupBanner({ needsEmail = false }: { needsEmail?: boolean }) {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("Supabase (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  if (needsEmail && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM)) missing.push("Resend (RESEND_API_KEY, RESEND_FROM)");
  if (missing.length === 0) return null;
  return (
    <div className="hair-card border-l-4 border-l-[#d97706] p-4">
      <div className="text-sm font-semibold text-[#b45309]">Backend not connected yet</div>
      <div className="mt-1 text-sm text-dim">
        Set the following env vars (officemindfries account) to go live: {missing.join(" · ")}. See{" "}
        <span className="mono">internal-admin/frontend/.env.example</span> and <span className="mono">TRACKER_SETUP.md</span>.
      </div>
    </div>
  );
}
