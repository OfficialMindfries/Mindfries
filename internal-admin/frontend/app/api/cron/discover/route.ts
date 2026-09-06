import { discover } from "@/lib/icp";
import { upsertLeads } from "@/lib/db";

export const dynamic = "force-dynamic";

// Vercel Cron hits this daily (see vercel.json). Vercel sends
// `Authorization: Bearer $CRON_SECRET`; reject anything else so the crawl
// can't be triggered by randoms.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
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
