import { notFound } from "next/navigation";
import { currentCompanyUser } from "@/lib/auth/company-users";
import { getJobRole, listApplicationsForRole, stageCountsForRole } from "@/lib/db";
import { EmptyState, PageHeader, Pill } from "@/components/ui";
import { fmtDate, roleStatusTone, stageLabel, stageTone } from "@/lib/format";
import type { ApplicationStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGE_ORDER: ApplicationStage[] = ["invited", "in_progress", "completed", "shortlisted", "rejected", "hired"];

export default async function RoleDetailPage({ params }: { params: Promise<{ roleId: string }> }) {
  const { roleId } = await params;
  const user = await currentCompanyUser();
  if (!user) notFound();

  const role = await getJobRole(user.companyId, roleId);
  if (!role) notFound();

  const [counts, applications] = await Promise.all([stageCountsForRole(role.id), listApplicationsForRole(role.id)]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Roles" title={role.title}>
        {role.techStack.length > 0 ? role.techStack.join(" · ") : "No tech stack recorded"}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={roleStatusTone[role.status]}>{role.status}</Pill>
        {!role.templateId && <Pill tone="amber">No assessment attached</Pill>}
        {STAGE_ORDER.map((s) => (
          <Pill key={s} tone={stageTone[s]}>
            {counts[s]} {stageLabel[s]}
          </Pill>
        ))}
      </div>

      {applications.length === 0 ? (
        <EmptyState title="No candidates yet" hint="Inviting candidates to a role is a separate piece of work, not yet built." />
      ) : (
        <div className="hair-card divide-y divide-hair">
          {applications.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{a.candidateName ?? a.candidateEmail}</div>
                <div className="truncate text-xs text-dim">{a.candidateEmail}</div>
              </div>
              <Pill tone={stageTone[a.stage]}>{stageLabel[a.stage]}</Pill>
              {a.score != null && <span className="mono text-sm text-dim">{a.score}%</span>}
              <span className="text-xs text-faint">{fmtDate(a.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
