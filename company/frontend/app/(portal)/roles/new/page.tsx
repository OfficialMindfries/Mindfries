import { PageHeader } from "@/components/ui";
import { NewRoleForm } from "./NewRoleForm";

export const dynamic = "force-dynamic";

/**
 * A role can be opened without an assessment attached — picking a published
 * game_template (IMPLEMENTATION.md §3.3) is a separate, later integration,
 * not a precondition for creating a role. template_id just stays null until
 * that lands.
 */
export default function NewRolePage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Roles" title="Create a role">
        Assessment selection isn&apos;t wired up yet — this role publishes without one attached, and you can attach it later.
      </PageHeader>
      <div className="hair-card max-w-xl p-6">
        <NewRoleForm />
      </div>
    </div>
  );
}
