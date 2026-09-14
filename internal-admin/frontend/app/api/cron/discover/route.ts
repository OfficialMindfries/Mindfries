import { discover } from "@/lib/icp";
import { upsertLeads } from "@/lib/db";
import { safeEqual } from "@/lib/auth/scrypt";

export const dynamic = "force-dynamic";

// Vercel Cron hits this daily (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET`; reject anything else so the crawl
// can't be triggered by randoms.
//
// Fails closed: an unset CRON_SECRET used to mean "skip the check" (the
// guard was `if (secret && ...)`), which left this deployed, unauthenticated
// endpoint open to anyone who found the URL — it triggers a real crawl and a
// real database write. "Not configured" now means "refuse," the same
// direction every other honest-refusal check in this repo already fails.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const found = await discover();
    const added = await upsertLeads(found);
    return Response.json({ ok: true, scanned: found.length, added });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
