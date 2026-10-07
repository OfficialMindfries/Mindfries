import Link from "next/link";
import { notFound } from "next/navigation";
import { currentCompanyUser } from "@/lib/auth/company-users";
import { can } from "@/lib/auth/permissions";
import { getJobRole, listApplicationsForRole, listPublishedTemplates, stageCountsForRole } from "@/lib/db";
import { Button, EmptyState, Field, Input, PageHeader, Pill } from "@/components/ui";
import { roleStatusTone, stageLabel, stageTone } from "@/lib/format";
import type { ApplicationStage, CandidateApplication } from "@/lib/types";
import { AssistantSettingsForm } from "./AssistantSettingsForm";
import { AttachTemplateForm } from "./AttachTemplateForm";
import { InterviewSettingsForm } from "./InterviewSettingsForm";
import { InviteCandidateForm } from "./InviteCandidateForm";
import { PipelineList } from "./PipelineList";
import { RoleStatusToggle } from "./RoleStatusToggle";

export const dynamic = "force-dynamic";

const STAGE_ORDER: ApplicationStage[] = ["invited", "in_progress", "completed", "shortlisted", "rejected", "hired"];

/** YYYY-MM-DD, comparable lexically against createdAt's ISO timestamp prefix. */
function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function applyFilters(
  applications: CandidateApplication[],
  filters: { scoreMin: number | null; scoreMax: number | null; dateFrom: string | null; dateTo: string | null },
): CandidateApplication[] {
  return applications.filter((a) => {
    if (filters.scoreMin != null && (a.score == null || a.score < filters.scoreMin)) return false;
    if (filters.scoreMax != null && (a.score == null || a.score > filters.scoreMax)) return false;
    if (filters.dateFrom && dateOnly(a.createdAt) < filters.dateFrom) return false;
    if (filters.dateTo && dateOnly(a.createdAt) > filters.dateTo) return false;
    return true;
  });
}

export default async function RoleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<{ stage?: string; scoreMin?: string; scoreMax?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const { roleId } = await params;
  const { stage: stageParam, scoreMin, scoreMax, dateFrom, dateTo } = await searchParams;
  const user = await currentCompanyUser();
  if (!user) notFound();

  const role = await getJobRole(user.companyId, roleId);
  if (!role) notFound();

  const canWriteRole = can("role:write", user.role);
  const [counts, allApplications, templates] = await Promise.all([
    stageCountsForRole(role.id),
    listApplicationsForRole(role.id),
    canWriteRole ? listPublishedTemplates() : Promise.resolve([]),
  ]);

  const activeStage = STAGE_ORDER.includes(stageParam as ApplicationStage) ? (stageParam as ApplicationStage) : null;
  const byStage = activeStage ? allApplications.filter((a) => a.stage === activeStage) : allApplications;
  const parsedScoreMin = scoreMin ? Number(scoreMin) : null;
  const parsedScoreMax = scoreMax ? Number(scoreMax) : null;
  const filters = {
    scoreMin: parsedScoreMin != null && !Number.isNaN(parsedScoreMin) ? parsedScoreMin : null,
    scoreMax: parsedScoreMax != null && !Number.isNaN(parsedScoreMax) ? parsedScoreMax : null,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
  };
  const hasFilters = filters.scoreMin != null || filters.scoreMax != null || !!filters.dateFrom || !!filters.dateTo;
  const applications = applyFilters(byStage, filters);
  const canChangeStage = can("candidate:stage", user.role);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Roles" title={role.title}>
        {role.techStack.length > 0 ? role.techStack.join(" · ") : "No tech stack recorded"}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={roleStatusTone[role.status]}>{role.status}</Pill>
        {canWriteRole && <RoleStatusToggle roleId={role.id} status={role.status} />}
        {role.templateId ? (
          <Pill tone="violet">{role.templateName ?? "Assessment attached"}</Pill>
        ) : (
          <Pill tone="amber">No assessment attached</Pill>
        )}
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

      {canWriteRole && (
        <AttachTemplateForm roleId={role.id} templates={templates} currentTemplateId={role.templateId} />
      )}

      {canWriteRole && <AssistantSettingsForm roleId={role.id} config={role.assistantConfig} />}
      {canWriteRole && <InterviewSettingsForm roleId={role.id} config={role.interviewConfig} />}

      {can("candidate:invite", user.role) && <InviteCandidateForm roleId={role.id} />}

      <form method="get" className="hair-card flex flex-wrap items-end gap-3 p-4">
        {activeStage && <input type="hidden" name="stage" value={activeStage} />}
        <div className="w-24">
          <Field label="Min score">
            <Input type="number" name="scoreMin" min={0} max={100} defaultValue={scoreMin ?? ""} placeholder="0" />
          </Field>
        </div>
        <div className="w-24">
          <Field label="Max score">
            <Input type="number" name="scoreMax" min={0} max={100} defaultValue={scoreMax ?? ""} placeholder="100" />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Invited from">
            <Input type="date" name="dateFrom" defaultValue={dateFrom ?? ""} />
          </Field>
        </div>
        <div className="w-40">
          <Field label="Invited to">
            <Input type="date" name="dateTo" defaultValue={dateTo ?? ""} />
          </Field>
        </div>
        <Button type="submit" size="sm">
          Apply
        </Button>
        {hasFilters && (
          <Link
            href={activeStage ? `/roles/${role.id}?stage=${activeStage}` : `/roles/${role.id}`}
            className="text-[13px] font-semibold text-dim hover:underline"
          >
            Clear filters
          </Link>
        )}
      </form>

      {applications.length === 0 ? (
        <EmptyState
          title={
            hasFilters
              ? "No candidates match these filters"
              : activeStage
                ? `No candidates in ${stageLabel[activeStage].toLowerCase()}`
                : "No candidates yet"
          }
          hint={activeStage || hasFilters ? undefined : "Invite one above to start this role's pipeline."}
        />
      ) : (
        <PipelineList roleId={role.id} applications={applications} canChangeStage={canChangeStage} />
      )}
    </div>
  );
}
