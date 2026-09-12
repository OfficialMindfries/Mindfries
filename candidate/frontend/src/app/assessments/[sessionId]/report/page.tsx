import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { ReportAutoRefresh } from "@/components/assessments/ReportAutoRefresh";
import { BackendAuthError, BackendError, getSession, getSessionReport, type ReportView } from "@/lib/backend/client";
import { currentCandidate } from "@/lib/auth/users";

export const metadata: Metadata = {
  title: "Evidence report · Mindfries",
  description: "What the workspace observed during your session.",
};

// Real, per-request data — a report's status can change between one request
// and the next while evaluation is running.
export const dynamic = "force-dynamic";

const RECOMMENDATION_LABEL: Record<string, string> = {
  strong_hire: "Strong hire",
  hire: "Hire",
  lean_no: "Leaning no",
  no_hire: "No hire",
};

const RECOMMENDATION_TONE: Record<string, string> = {
  strong_hire: "bg-[#1A9E6B]/10 text-[#0F6B49] border-[#1A9E6B]/30",
  hire: "bg-[#1A9E6B]/10 text-[#0F6B49] border-[#1A9E6B]/30",
  lean_no: "bg-[#E3A63B]/10 text-[#8A5E13] border-[#E3A63B]/30",
  no_hire: "bg-[#a6203c]/10 text-[#a6203c] border-[#a6203c]/30",
};

const CATEGORY_LABEL: Record<string, string> = {
  code_evaluation: "Code evaluation",
  reasoning: "Reasoning",
  workflow: "Workflow",
  interview: "Interview",
};

const STATUS_COPY: Record<ReportView["status"], { title: string; body: string }> = {
  pending: {
    title: "Waiting to start",
    body: "Your submission was received. Evaluation hasn't started running yet — this page will update on its own.",
  },
  generating: {
    title: "Generating your report",
    body: "The Code Evaluation, Reasoning and Workflow agents are reading your session now. This usually takes under a minute.",
  },
  ready: { title: "", body: "" }, // rendered separately below
  failed: {
    title: "Evaluation didn't complete",
    body: "",
  },
};

async function loadReportData(sessionId: string) {
  try {
    const [session, report] = await Promise.all([getSession(sessionId), getSessionReport(sessionId)]);
    return { session, report };
  } catch (err) {
    if (err instanceof BackendAuthError) redirect(`/login?next=/assessments/${sessionId}/report`);
    if (err instanceof BackendError && err.status === 404) notFound();
    throw err;
  }
}

export default async function SessionReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const [{ session, report }, viewer] = await Promise.all([loadReportData(sessionId), currentCandidate()]);

  const isTerminal = report.status === "ready" || report.status === "failed";

  return (
    <div className="min-h-full flex-1 bg-[#F6FAFD]">
      <DashboardNav sessionName={viewer?.name} />
      {!isTerminal && <ReportAutoRefresh />}

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#4A7FA7]">Evidence report</p>
          <h1 className="mt-1.5 text-[26px] leading-tight font-semibold tracking-tight text-[#0A1931]">
            Session {session.startedAt.slice(0, 10)}
          </h1>
          <p className="mt-1 text-sm text-[#4A7FA7]">
            {session.durationMin} min assessment · session {sessionId.slice(0, 8)}
          </p>
        </div>

        <div className="mt-8">
          {report.status !== "ready" && (
            <div className="rounded-2xl border border-[#B3CFE5] bg-white p-6">
              <div className="flex items-center gap-3">
                {!isTerminal && (
                  <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[#4A7FA7]" aria-hidden />
                )}
                <h2 className="text-[15px] font-semibold text-[#0A1931]">
                  {report.status === "failed" ? STATUS_COPY.failed.title : STATUS_COPY[report.status].title}
                </h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#4A7FA7]">
                {report.status === "failed"
                  ? report.error ?? "No reason was recorded."
                  : STATUS_COPY[report.status].body}
              </p>
              {report.status === "failed" && (
                <p className="mt-3 text-xs text-[#4A7FA7]">
                  This is an honest failure, not a fabricated score — nothing here was scored because evaluation
                  couldn&apos;t run.
                </p>
              )}
            </div>
          )}

          {report.status === "ready" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-[#B3CFE5] bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-[15px] font-semibold text-[#0A1931]">Recommendation</h2>
                  {report.recommendation ? (
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${RECOMMENDATION_TONE[report.recommendation] ?? "border-[#B3CFE5] text-[#4A7FA7]"}`}
                    >
                      {RECOMMENDATION_LABEL[report.recommendation] ?? report.recommendation}
                    </span>
                  ) : (
                    <span className="rounded-full border border-[#B3CFE5] px-3 py-1 text-xs font-medium text-[#4A7FA7]">
                      Not given
                    </span>
                  )}
                </div>
                {report.summary && (
                  <p className="mt-3 text-sm leading-relaxed text-[#1A3D63]">{report.summary}</p>
                )}
              </div>

              {report.evidence && report.evidence.length > 0 ? (
                <div className="space-y-4">
                  <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#4A7FA7]">
                    Evidence, by agent
                  </h2>
                  {report.evidence.map((item, i) => (
                    <div key={i} className="rounded-2xl border border-[#B3CFE5] bg-white p-5">
                      <p className="text-xs font-semibold uppercase tracking-widest text-[#4A7FA7]">
                        {CATEGORY_LABEL[item.category] ?? item.category}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-[#0A1931]">{item.observation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#B3CFE5] bg-white p-6 text-sm text-[#4A7FA7]">
                  No individual observations were recorded for this session.
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
