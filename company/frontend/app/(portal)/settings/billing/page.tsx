import { currentCompanyUser } from "@/lib/auth/company-users";
import { getCompanyBilling } from "@/lib/db";
import { PageHeader, StatCard } from "@/components/ui";
import { titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * IMPLEMENTATION.md §3.4: plan, seats, and usage — display only, no Stripe,
 * no webhooks, no invoice UI, per the PRD's own MVP scope (§2.1: "billing
 * automation... can wait").
 */
export default async function BillingSettingsPage() {
  const user = await currentCompanyUser();
  const billing = user
    ? await getCompanyBilling(user.companyId)
    : { plan: "trial", seatsTotal: 0, seatsUsed: 0, openRoles: 0, candidatesInvited: 0 };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Billing">
        Plan, seats, and usage — no payment processing yet.
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Plan" value={titleCase(billing.plan)} />
        <StatCard label="Seats" value={`${billing.seatsUsed} / ${billing.seatsTotal}`} />
        <StatCard label="Open Roles" value={billing.openRoles} />
        <StatCard label="Candidates Invited" value={billing.candidatesInvited} />
      </div>
    </div>
  );
}
