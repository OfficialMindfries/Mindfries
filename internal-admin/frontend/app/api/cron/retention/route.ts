import { expireOldRecordings } from "@/lib/retention";
import { safeEqual } from "@/lib/auth/scrypt";

export const dynamic = "force-dynamic";

// Vercel Cron hits this daily (see vercel.json) to delete interview
// recordings past their 90-day retention — lib/retention.ts. Same guard as
// the discovery cron, and it fails closed for the same reason: this one
// permanently deletes files.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...(await expireOldRecordings()) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
