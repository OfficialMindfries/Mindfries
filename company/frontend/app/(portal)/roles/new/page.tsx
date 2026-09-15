import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * IMPLEMENTATION.md Phase 3: pick a published game_template and configure
 * duration/tech-stack/visibility/candidate-facing fields (§3.3) — not
 * rubric or interviewer-prompt authoring, which stays admin-only. Not built
 * yet; this stub exists so the nav link from /roles works instead of 404ing.
 */
export default function NewRolePage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Roles" title="Create a role" />
      <EmptyState
        title="Coming in Phase 3"
        hint="Picking a published assessment template and configuring it for this role — see IMPLEMENTATION.md §11."
      />
    </div>
  );
}
