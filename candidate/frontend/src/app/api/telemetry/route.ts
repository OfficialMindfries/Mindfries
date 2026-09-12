import { NextResponse } from "next/server";
import { BackendAuthError, BackendError, postSessionEvents } from "@/lib/backend/client";

/**
 * Same-origin bridge between the browser (which can't call candidate/backend
 * directly and keep the httpOnly "mf_candidate" cookie — it's scoped to
 * this app's origin, not the Go backend's) and the real telemetry endpoint.
 * This route runs server-side, reads the cookie the browser already sent it,
 * and relays events server-to-server via src/lib/backend/client.ts, which
 * forwards that same cookie onward. The backend re-verifies it independently
 * either way — this route is a relay, not a second trust boundary.
 */
export async function POST(request: Request) {
  let body: { sessionId?: string; events?: { type: string; payload: unknown }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "malformed request body" }, { status: 400 });
  }

  const { sessionId, events } = body;
  if (!sessionId || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "sessionId and a non-empty events array are required" }, { status: 400 });
  }

  try {
    const result = await postSessionEvents(sessionId, events);
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    if (err instanceof BackendAuthError) {
      return NextResponse.json({ error: "sign in required" }, { status: 401 });
    }
    if (err instanceof BackendError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 502 });
    }
    return NextResponse.json({ error: "could not record telemetry" }, { status: 502 });
  }
}
