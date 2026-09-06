import Link from "next/link";
import { companies, templates, sessions } from "@/lib/mock-data";
import { PageHeader, StatCard, Pill } from "@/components/ui";
import { sessionTone, healthTone } from "@/lib/format";

export default function OverviewPage() {
  const activeCompanies = companies.filter((c) => c.status === "active").length;
  const onboarding = companies.filter((c) => c.status === "onboarding").length;
  const live = sessions.filter((s) => s.status === "live").length;
  const published = templates.filter((t) => t.status === "published").length;
  const attention = sessions.filter((s) => s.status === "stuck" || s.status === "failed");
  const recentTemplates = [...templates].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Mindfries Ops" title="Overview">
        Everything the Mindfries team runs — company onboarding, the shared assessment library, and every candidate
        session across all companies, in one place.
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active companies" value={activeCompanies} hint={`${onboarding} onboarding`} />
        <StatCard label="Live sessions" value={live} hint="across all companies" />
        <StatCard label="Published games" value={published} hint={`${templates.length - published} in draft`} />
        <StatCard label="Needs attention" value={attention.length} hint="stuck or failed" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Sessions needing attention */}
        <div className="hair-card lg:col-span-3">
          <div className="flex items-center justify-between border-b border-hair px-5 py-4">
            <h2 className="text-lg font-extrabold tracking-tight">Needs attention</h2>
            <Link href="/admin/sessions" className="text-sm font-semibold text-accent hover:underline">
              Session monitor →
            </Link>
          </div>
          {attention.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-dim">All sessions healthy.</div>
          ) : (
            <ul className="divide-y divide-hair">
              {attention.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{s.candidateName}</div>
                    <div className="truncate text-xs text-dim">
                      {s.companyName} · {s.templateName}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Pill tone={healthTone[s.sandboxHealth]}>sandbox {s.sandboxHealth}</Pill>
                    <Pill tone={sessionTone[s.status]}>{s.status}</Pill>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recently authored games */}
        <div className="hair-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-hair px-5 py-4">
            <h2 className="text-lg font-extrabold tracking-tight">Recent games</h2>
            <Link href="/admin/library" className="text-sm font-semibold text-accent hover:underline">
              Library →
            </Link>
          </div>
          <ul className="divide-y divide-hair">
            {recentTemplates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{t.name}</div>
                  <div className="truncate text-xs text-dim">used by {t.usedByCompanies} companies</div>
                </div>
                <Pill tone={t.status === "published" ? "green" : "gray"}>{t.status}</Pill>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
