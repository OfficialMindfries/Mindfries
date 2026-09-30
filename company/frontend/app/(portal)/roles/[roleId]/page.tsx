import Link from "next/link";
import { notFound } from "next/navigation";
import { currentCompanyUser } from "@/lib/auth/company-users";
import { can } from "@/lib/auth/permissions";
import { getJobRole, listApplicationsForRole, stageCountsForRole } from "@/lib/db";
import { Button, EmptyState, PageHeader, Pill } from "@/components/ui";
import { fmtDate, roleStatusTone, stageLabel, stageTone } from "@/lib/format";
import type { ApplicationStage } from "@/lib/types";
import { InviteCandidateForm } from "./InviteCandidateForm";
import { changeStage } from "./actions";

export const dynamic = "force-dynamic";

const STAGE_ORDER: ApplicationStage[] = ["invited", "in_progress", "completed", "shortlisted", "rejected", "hired"];

// The three moves a company actually makes by hand — any stage to any of
// these, not a strict state machine. Everything else (invited → in_progress
// → completed) is the candidate's own progress through the assessment.
const STAGE_ACTIONS: { stage: ApplicationStage; label: string; variant: "primary" | "danger" | "soft" }[] = [
  { stage: "shortlisted", label: "Shortlist", variant: "soft" },
  { stage: "hired", label: "Hire", variant: "primary" },
  { stage: "rejected", label: "Reject", variant: "danger" },
];

export default async function RoleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { roleId } = await params;
  const { stage: stageParam } = await searchParams;
  const user = await currentCompanyUser();
  if (!user) notFound();

  const role = await getJobRole(user.companyId, roleId);
  if (!role) notFound();

  const [counts, allApplications] = await Promise.all([stageCountsForRole(role.id), listApplicationsForRole(role.id)]);

  const activeStage = STAGE_ORDER.includes(stageParam as ApplicationStage) ? (stageParam as ApplicationStage) : null;
  const applications = activeStage ? allApplications.filter((a) => a.stage === activeStage) : allApplications;
  const canChangeStage = can("candidate:stage", user.role);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Roles" title={role.title}>
        {role.techStack.length > 0 ? role.techStack.join(" · ") : "No tech stack recorded"}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={roleStatusTone[role.status]}>{role.status}</Pill>
        {!role.templateId && <Pill tone="amber">No assessment attached</Pill>}
        <Link href={`/roles/${role.id}`}>
          <Pill tone={activeStage === null ? "violet" : "gray"}>All ({allApplications.length})</Pill>
        </Link>
        {STAGE_ORDER.map((s) => (
          <Link key={s} href={`/roles/${role.id}?stage=${s}`}>
            <Pill tone={activeStage === s ? "violet" : stageTone[s]}>
              {counts[s]} {stageLabel[s]}
            </Pill>
          </Link>
        ))}
      </div>

      {can("candidate:invite", user.role) && <InviteCandidateForm roleId={role.id} />}

      {applications.length === 0 ? (
        <EmptyState
          title={activeStage ? `No candidates in ${stageLabel[activeStage].toLowerCase()}` : "No candidates yet"}
          hint={activeStage ? undefined : "Invite one above to start this role's pipeline."}
        />
      ) : (
        <div className="hair-card divide-y divide-hair">
          {applications.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
              <Link href={`/candidates/${a.id}`} className="min-w-0 flex-1 hover:underline">
                <div className="truncate text-sm font-bold">{a.candidateName ?? a.candidateEmail}</div>
                <div className="truncate text-xs text-dim">{a.candidateEmail}</div>
              </Link>
              <Pill tone={stageTone[a.stage]}>{stageLabel[a.stage]}</Pill>
              {a.score != null && <span className="mono text-sm text-dim">{a.score}%</span>}
              <span className="text-xs text-faint">{fmtDate(a.createdAt)}</span>

              {canChangeStage && (
                <div className="flex shrink-0 gap-1.5">
                  {STAGE_ACTIONS.filter((sa) => sa.stage !== a.stage).map((sa) => (
                    <form key={sa.stage} action={changeStage.bind(null, role.id, a.id, sa.stage)}>
                      <Button type="submit" size="sm" variant={sa.variant} className="!px-3 !py-1.5 !text-[12px]">
                        {sa.label}
                      </Button>
                    </form>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
