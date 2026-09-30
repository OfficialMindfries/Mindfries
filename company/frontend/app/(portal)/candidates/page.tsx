import { currentCompanyUser } from "@/lib/auth/company-users";
import { listApplicationsForCompany, listJobRoles, type CandidateApplicationWithRole } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import type { JobRole } from "@/lib/types";
import { CandidatesBoard } from "./CandidatesBoard";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const user = await currentCompanyUser();
  let roles: JobRole[] = [];
  let applications: CandidateApplicationWithRole[] = [];
  if (user) {
    [roles, applications] = await Promise.all([listJobRoles(user.companyId), listApplicationsForCompany(user.companyId)]);
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Candidates" title="All candidates">
        Every candidate, grouped by role.
      </PageHeader>

      <CandidatesBoard roles={roles} applications={applications} />
    </div>
  );
}
