"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import { startCheckout, openBillingPortal, type BillingActionState } from "./actions";

const PLAN_LABEL = { starter: "Starter", growth: "Growth", enterprise: "Enterprise" } as const;
const INITIAL: BillingActionState = { error: null };

function PlanButton({ plan }: { plan: keyof typeof PLAN_LABEL }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="plan" value={plan} variant="soft" size="sm" disabled={pending}>
      {pending ? "Starting…" : `Upgrade to ${PLAN_LABEL[plan]}`}
    </Button>
  );
}

function PortalButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Opening…" : "Manage billing"}
    </Button>
  );
}

/** Admin-only buttons (billing:manage) to start a real Stripe checkout for a plan, or open the Stripe-hosted self-serve portal for an existing subscription. */
export function BillingActions() {
  const [checkoutState, checkoutAction] = useActionState<BillingActionState, FormData>(startCheckout, INITIAL);
  const [portalState, portalAction] = useActionState<BillingActionState, FormData>(openBillingPortal, INITIAL);
  const error = checkoutState.error ?? portalState.error;

  return (
    <div className="hair-card space-y-3 p-4">
      <form action={checkoutAction} className="flex flex-wrap gap-2">
        {(Object.keys(PLAN_LABEL) as Array<keyof typeof PLAN_LABEL>).map((plan) => (
          <PlanButton key={plan} plan={plan} />
        ))}
      </form>
      <form action={portalAction}>
        <PortalButton />
      </form>
      {error && <p className="text-[13px] font-semibold text-[var(--color-accent-2)]">{error}</p>}
    </div>
  );
}
