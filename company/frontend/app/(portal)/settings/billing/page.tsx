import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * IMPLEMENTATION.md §3.4: plan, seats, and a usage/credits display only —
 * no Stripe, no webhooks, no invoice UI, per the PRD's own MVP scope
 * (§2.1: "billing automation... can wait"). Not built yet.
 */
export default function BillingSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Billing" />
      <EmptyState title="Coming in Phase 4" hint="Plan, seats, and usage — a display only, no payment processing. See IMPLEMENTATION.md §3.4." />
    </div>
  );
}
