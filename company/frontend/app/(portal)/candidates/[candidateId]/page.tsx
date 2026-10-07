import { notFound } from "next/navigation";
import { currentCompanyUser } from "@/lib/auth/company-users";
import { can } from "@/lib/auth/permissions";
import { getApplicationForCompany, getCandidateReport } from "@/lib/db";
import { EmptyState, PageHeader, Pill } from "@/components/ui";
import { fmtDate, recommendationLabel, sessionStatusTone, stageLabel, stageTone, titleCase } from "@/lib/format";
import { EvidenceList } from "./EvidenceList";
import { InterviewTranscript } from "./InterviewTranscript";
import { ReviewerDecisionForm } from "./ReviewerDecisionForm";
import { ReportAutoRefresh } from "./ReportAutoRefresh";

export const dynamic = "force-dynamic";

export default async function CandidateDetailPage({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const user = await currentCompanyUser();
  if (!user) notFound();

  const application = await getApplicationForCompany(user.companyId, candidateId);
  if (!application) notFound();

  const { session, report, interview } = await getCandidateReport(application.assessmentId);
  const pending = report?.status === "pending" || report?.status === "generating";
  const canReview = can("candidate:stage", user.role);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={application.roleTitle} title={application.candidateName ?? application.candidateEmail}>
        {application.candidateEmail}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={stageTone[application.stage]}>{stageLabel[application.stage]}</Pill>
        {application.score != null && <span className="mono text-sm text-dim">{application.score}%</span>}
        <span className="text-xs text-faint">Invited {fmtDate(application.createdAt)}</span>
      </div>

      {Object.keys(application.sectionScores).length > 0 && (
        <div className="hair-card divide-y divide-hair">
          {Object.entries(application.sectionScores).map(([section, score]) => (
            <div key={section} className="flex items-center justify-between px-6 py-3">
              <span className="text-sm font-semibold">{titleCase(section)}</span>
              <span className="mono text-sm text-dim">{score}%</span>
            </div>
          ))}
        </div>
      )}

      {!session ? (
        <EmptyState title="Hasn't started yet" hint="A session and report show up here once the candidate begins their assessment." />
      ) : (
        <>
          <div className="hair-card p-5">
            <div className="eyebrow">Session</div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <Pill tone={sessionStatusTone[session.status] ?? "gray"}>{session.status}</Pill>
              <span className="mono text-dim">
                {session.elapsedMin}/{session.durationMin}m
              </span>
              <span className="text-dim">sandbox {session.sandboxHealth}</span>
            </div>
          </div>

          {!report || pending ? (
            <EmptyState
              title={report?.status === "generating" ? "Generating report…" : "Report not started yet"}
              hint="This refreshes automatically once it's ready."
            />
          ) : report.status === "failed" ? (
            <div className="hair-card p-5 text-sm text-[#a6203c]">
              Report failed to generate{report.error ? `: ${report.error}` : "."}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="hair-card p-5">
                <div className="eyebrow">AI recommendation</div>
                <div className="mt-2 text-xl font-extrabold tracking-tight">
                  {report.recommendation ? (recommendationLabel[report.recommendation] ?? report.recommendation) : "—"}
                </div>
                {report.summary && <p className="mt-3 text-sm text-dim">{report.summary}</p>}

                {report.review && (
                  <div className="mt-4 border-t border-hair pt-4">
                    <div className="eyebrow">Reviewer&apos;s decision</div>
                    <div className="mt-2 text-lg font-extrabold tracking-tight">
                      {report.review.recommendation ? (recommendationLabel[report.review.recommendation] ?? report.review.recommendation) : "Not decided"}
                    </div>
                    {report.review.note && <p className="mt-2 text-sm whitespace-pre-line">{report.review.note}</p>}
                    {report.review.by && (
                      <p className="mt-2 text-xs text-faint">
                        {report.review.by}
                        {report.review.at ? ` · ${fmtDate(report.review.at)}` : ""}
                      </p>
                    )}
                  </div>
                )}
                {canReview && <ReviewerDecisionForm applicationId={application.id} review={report.review} />}
              </div>

              <EvidenceList
                applicationId={application.id}
                evidence={report.evidence}
                moments={report.moments}
                annotations={report.annotations}
                canAnnotate={canReview}
              />
            </div>
          )}

          <InterviewTranscript exchanges={interview} />

          {pending && <ReportAutoRefresh />}
        </>
      )}
    </div>
  );
}
