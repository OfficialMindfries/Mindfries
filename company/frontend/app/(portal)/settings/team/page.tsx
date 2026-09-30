import { currentCompanyUser } from "@/lib/auth/company-users";
import { can } from "@/lib/auth/permissions";
import { listCompanyUsers } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { TeamRoster } from "./TeamRoster";

export const dynamic = "force-dynamic";

/** IMPLEMENTATION.md Phase 4: invite teammates (email via Resend) and manage their status against the permission matrix in lib/auth/permissions.ts. */
export default async function TeamSettingsPage() {
  const user = await currentCompanyUser();
  const users = user ? await listCompanyUsers(user.companyId) : [];
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Team">
        Who on your side can see roles, candidates, and reports.
      </PageHeader>
      <TeamRoster users={users} currentEmail={user?.email ?? ""} canManage={!!user && can("team:manage", user.role)} />
    </div>
  );
}
