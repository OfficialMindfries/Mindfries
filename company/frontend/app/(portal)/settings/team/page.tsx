import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * IMPLEMENTATION.md Phase 4: invite teammate flow (email via Resend,
 * pending/accepted states through the same /set-password link mechanism
 * this app's ops-created first admin already uses), role management
 * against the permission matrix in lib/auth/permissions.ts. Not built yet.
 */
export default function TeamSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Team" />
      <EmptyState title="Coming in Phase 4" hint="Invite teammates and manage their roles — see IMPLEMENTATION.md §11." />
    </div>
  );
}
