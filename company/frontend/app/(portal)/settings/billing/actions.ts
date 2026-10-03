"use server";

import { redirect } from "next/navigation";
import { ForbiddenError, requireCompanyPermission } from "@/lib/auth/company-users";
import { backendReady, createCheckoutSessionViaBackend, createPortalSessionViaBackend, type BillingPlan } from "@/lib/backend/client";

export type BillingActionState = { error: string | null };

const PLANS: BillingPlan[] = ["starter", "growth", "enterprise"];

const NOT_CONNECTED = "Billing isn't connected yet — ask Mindfries to configure COMPANY_BACKEND_URL and Stripe.";

/**
 * Starts a real Stripe Checkout for a plan purchase/change. There is no
 * Supabase-only fallback here (unlike every other action in this app) — real
 * checkout genuinely can't happen without company/backend and a configured
 * Stripe secret key, so the honest answer when either is missing is "not
 * connected yet", not a fake success.
 */
export async function startCheckout(_prev: BillingActionState, form: FormData): Promise<BillingActionState> {
  try {
    await requireCompanyPermission("billing:manage");
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in." };
  }

  if (!backendReady()) return { error: NOT_CONNECTED };

  const plan = form.get("plan");
  if (typeof plan !== "string" || !PLANS.includes(plan as BillingPlan)) {
    return { error: "Pick a plan." };
  }

  let url: string;
  try {
    const result = await createCheckoutSessionViaBackend(plan as BillingPlan);
    url = result.url;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start checkout — try again." };
  }
  redirect(url);
}

/** Opens company/backend's Stripe Billing Portal link — same "no fallback, honest not-connected message" rule as startCheckout. */
export async function openBillingPortal(
  // No form fields — useActionState still calls this as (prevState,
  // formData); neither is read here, same convention
  // settings/team/actions.ts's setTeammateStatus already uses for the same
  // reason.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _prev: BillingActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _form: FormData,
): Promise<BillingActionState> {
  try {
    await requireCompanyPermission("billing:manage");
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Not signed in." };
  }

  if (!backendReady()) return { error: NOT_CONNECTED };

  let url: string;
  try {
    const result = await createPortalSessionViaBackend();
    url = result.url;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't open the billing portal — try again." };
  }
  redirect(url);
}
