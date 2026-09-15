import Link from "next/link";
import { currentCompanyUser } from "@/lib/auth/company-users";
import { listApplicationsForCompany } from "@/lib/db";
import { EmptyState, PageHeader, Pill } from "@/components/ui";
import { fmtDate, stageLabel, stageTone } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const user = await currentCompanyUser();
  const applications = user ? await listApplicationsForCompany(user.companyId) : [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Candidates" title="All candidates">
        Every candidate across every role.
      </PageHeader>

      {applications.length === 0 ? (
        <EmptyState title="No candidates yet" hint="Candidates show up here once a role has invited someone (Phase 3)." />
      ) : (
        <div className="hair-card divide-y divide-hair">
          {applications.map((a) => (
            <Link key={a.id} href={`/candidates/${a.id}`} className="flex flex-wrap items-center gap-4 px-6 py-3.5 transition hover:bg-black/[0.02]">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{a.candidateName ?? a.candidateEmail}</div>
                <div className="truncate text-xs text-dim">{a.roleTitle}</div>
              </div>
              <Pill tone={stageTone[a.stage]}>{stageLabel[a.stage]}</Pill>
              {a.score != null && <span className="mono text-sm text-dim">{a.score}%</span>}
              <span className="text-xs text-faint">{fmtDate(a.createdAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
