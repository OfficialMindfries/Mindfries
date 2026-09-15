import { currentCompanyUser } from "@/lib/auth/company-users";
import { listJobRoles } from "@/lib/db";
import { supabaseReady } from "@/lib/supabase";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Overview — Phase 2 (IMPLEMENTATION.md §11) fills this in with candidates-
 * in-pipeline / pending-review widgets once job_roles and
 * candidate_applications have real rows. For now: real counts (zero until
 * Phase 3 ships role creation), not sample data standing in for them —
 * this app's own version of the "real, or an honest failure" rule.
 */
export default async function OverviewPage() {
  const user = await currentCompanyUser();
  const roles = supabaseReady() && user ? await listJobRoles(user.companyId) : [];
  const openRoles = roles.filter((r) => r.status === "open");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={user?.companyName || "Company Portal"} title="Overview">
        Active roles, candidates in your pipeline, and what needs your review.
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active Roles" value={openRoles.length} />
        <StatCard label="Candidates in Progress" value={0} hint="Wired once candidate_applications has rows (Phase 3)" />
        <StatCard label="Ready for Review" value={0} hint="Completed but not yet shortlisted or rejected" />
      </div>

      {roles.length === 0 && (
        <EmptyState
          title="No roles yet"
          hint="Create your first role to start inviting candidates. (Role creation ships in Phase 3.)"
        />
      )}
    </div>
  );
}
