import { leadIdForResendId, recordEmailEvent } from "@/lib/db";
import { safeEqual } from "@/lib/auth/scrypt";

export const dynamic = "force-dynamic";

// Resend engagement webhook (delivered / opened / clicked / bounced). Point
// Resend at /api/webhooks/resend?token=$RESEND_WEBHOOK_SECRET.
// A poor man's shared-secret query gate — real, but worth upgrading to Svix
// signature verification (svix headers on the request) if this ever needs
// to be more than that.
//
// Fails closed: an unset RESEND_WEBHOOK_SECRET used to mean "skip the
// check" (the guard was `if (secret && ...)`), so anyone could POST forged
// delivered/opened/clicked/bounced events and poison lead-engagement data.
// "Not configured" now means "refuse," matching the cron route's fix.
const MAP: Record<string, "delivered" | "opened" | "clicked" | "bounced"> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "bounced",
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  if (!secret || !safeEqual(token, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const evt = (await request.json()) as { type?: string; data?: { email_id?: string } };
    const type = evt.type ? MAP[evt.type] : undefined;
    const resendId = evt.data?.email_id;
    if (type && resendId) {
      const leadId = await leadIdForResendId(resendId);
      if (leadId) await recordEmailEvent({ leadId, type });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
