import { currentCompanyUser } from "@/lib/auth/company-users";
import { can } from "@/lib/auth/permissions";
import { getCompanyBilling } from "@/lib/db";
import { PageHeader, StatCard } from "@/components/ui";
import { titleCase } from "@/lib/format";
import { BillingActions } from "./BillingActions";

export const dynamic = "force-dynamic";

/**
 * IMPLEMENTATION.md §3.4: plan, seats, and usage — display always real,
 * from Supabase directly (lib/db.ts's getCompanyBilling), same as every
 * other read in this app. The Upgrade/Manage billing actions below are the
 * one place this app talks to company/backend — real Stripe checkout and
 * the billing portal link genuinely can't happen from here alone.
 */
export default async function BillingSettingsPage() {
  const user = await currentCompanyUser();
  const billing = user
    ? await getCompanyBilling(user.companyId)
    : { plan: "trial", seatsTotal: 0, seatsUsed: 0, openRoles: 0, candidatesInvited: 0 };
  const canManageBilling = !!user && can("billing:manage", user.role);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Billing">
        Plan, seats, and usage.
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Plan" value={titleCase(billing.plan)} />
        <StatCard label="Seats" value={`${billing.seatsUsed} / ${billing.seatsTotal}`} />
        <StatCard label="Open Roles" value={billing.openRoles} />
        <StatCard label="Candidates Invited" value={billing.candidatesInvited} />
      </div>

      {canManageBilling && <BillingActions />}
    </div>
  );
}
