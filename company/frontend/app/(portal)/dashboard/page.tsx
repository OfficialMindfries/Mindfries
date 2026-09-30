import { currentCompanyUser } from "@/lib/auth/company-users";
import { listApplicationsForCompany, listJobRoles, listUpcomingDueDates, type CandidateApplicationWithRole } from "@/lib/db";
import { supabaseReady } from "@/lib/supabase";
import { EmptyState, LinkButton, PageHeader, Panel, StatCard } from "@/components/ui";
import type { DueCandidate, JobRole } from "@/lib/types";
import { TrendChart } from "./TrendChart";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { DueDateCalendar } from "./DueDateCalendar";
import { ActivityFeed } from "./ActivityFeed";

export const dynamic = "force-dynamic";

/** Overview — the four PRD §1.4 stat cards, plus real invite trend/heatmap/calendar/activity widgets below them. */
export default async function OverviewPage() {
  const user = await currentCompanyUser();
  let roles: JobRole[] = [];
  let applications: CandidateApplicationWithRole[] = [];
  let dueDates: DueCandidate[] = [];
  if (supabaseReady() && user) {
    [roles, applications, dueDates] = await Promise.all([
      listJobRoles(user.companyId),
      listApplicationsForCompany(user.companyId),
      listUpcomingDueDates(user.companyId),
    ]);
  }

  const openRoles = roles.filter((r) => r.status === "open");
  const inProgress = applications.filter((a) => a.stage === "invited" || a.stage === "in_progress");
  const completed = applications.filter((a) => a.stage !== "invited" && a.stage !== "in_progress");
  const readyForReview = applications.filter((a) => a.stage === "completed");
  const asOf = new Date();
  const createdAtDates = applications.map((a) => a.createdAt);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={user?.companyName || "Company Portal"} title="Overview">
        Active roles, candidates in your pipeline, and what needs your review.
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Roles" value={openRoles.length} />
        <StatCard label="Candidates in Progress" value={inProgress.length} />
        <StatCard label="Completed Assessments" value={completed.length} />
        <StatCard label="Ready for Review" value={readyForReview.length} hint="Completed but not yet shortlisted or rejected" />
      </div>

      {roles.length === 0 ? (
        <EmptyState
          title="No roles yet"
          hint="Create your first role to start building a pipeline."
          action={<LinkButton href="/roles/new" size="sm">New role</LinkButton>}
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-5">
            <Panel title="Candidates invited" subtitle="Per week, last 12 weeks." className="lg:col-span-3">
              <TrendChart createdAtDates={createdAtDates} asOf={asOf} />
            </Panel>
            <Panel title="Due dates" className="lg:col-span-2">
              <DueDateCalendar due={dueDates} asOf={asOf} />
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Panel title="Invite activity" subtitle="Last 13 weeks." className="lg:col-span-2">
              <ActivityHeatmap createdAtDates={createdAtDates} asOf={asOf} />
            </Panel>
            <Panel title="Recent activity" className="lg:col-span-3">
              <ActivityFeed roles={roles} applications={applications} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
