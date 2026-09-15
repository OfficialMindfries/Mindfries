import Link from "next/link";
import { currentCompanyUser } from "@/lib/auth/company-users";
import { listJobRoles, stageCountsForRole } from "@/lib/db";
import { Button, EmptyState, PageHeader, Pill } from "@/components/ui";
import { roleStatusTone, stageLabel, stageTone } from "@/lib/format";
import type { ApplicationStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGE_ORDER: ApplicationStage[] = ["invited", "in_progress", "completed", "shortlisted", "rejected", "hired"];

/**
 * One row per role, with a per-stage pipeline breakdown at a glance
 * (IMPLEMENTATION.md §9) — the same stage-count badge this page uses gets
 * reused unchanged on /roles/[roleId]'s own pipeline header once that page
 * has more than a stub.
 */
export default async function RolesPage() {
  const user = await currentCompanyUser();
  const roles = user ? await listJobRoles(user.companyId) : [];
  const counts = await Promise.all(roles.map((r) => stageCountsForRole(r.id)));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Roles" title="Job roles" action={<Button size="sm">New role</Button>}>
        Every role you&apos;re hiring for, and where its pipeline stands.
      </PageHeader>

      {roles.length === 0 ? (
        <EmptyState
          title="No roles yet"
          hint="Role creation — picking a published assessment template and configuring it for a role — ships in Phase 3."
        />
      ) : (
        <div className="hair-card divide-y divide-hair">
          {roles.map((role, i) => (
            <Link key={role.id} href={`/roles/${role.id}`} className="flex flex-wrap items-center gap-4 px-6 py-4 transition hover:bg-black/[0.02]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold">{role.title}</span>
                  <Pill tone={roleStatusTone[role.status]}>{role.status}</Pill>
                </div>
                {role.techStack.length > 0 && <div className="mt-1 truncate text-xs text-dim">{role.techStack.join(" · ")}</div>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STAGE_ORDER.filter((s) => counts[i][s] > 0).map((s) => (
                  <Pill key={s} tone={stageTone[s]}>
                    {counts[i][s]} {stageLabel[s]}
                  </Pill>
                ))}
                {STAGE_ORDER.every((s) => counts[i][s] === 0) && <span className="text-xs text-faint">No candidates yet</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
