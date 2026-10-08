import { NextResponse } from "next/server";
import { BackendAuthError, backendReady, streamAssistant } from "@/lib/backend/client";

// A reply is written over several seconds; this must never be cached or
// pre-rendered.
export const dynamic = "force-dynamic";

/**
 * Same-origin bridge for the workspace assistant, for the same reason as
 * /api/telemetry: the browser can't call candidate/backend directly and keep
 * the httpOnly "mf_candidate" cookie. This route reads the cookie the browser
 * sent it and relays the question server-to-server; the backend re-verifies
 * the cookie and owns every rule about what the assistant may be asked.
 *
 * It is a route rather than a server action because the reply is streamed:
 * the backend answers with server-sent events as the model writes, and this
 * passes that stream straight through to the page (see ChatPanel).
 */
export async function POST(request: Request) {
  if (!backendReady()) {
    return NextResponse.json({ error: "The assessment service isn't connected, so the assistant can't be reached right now." }, { status: 503 });
  }

  let body: { sessionId?: unknown } & Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "malformed request body" }, { status: 400 });
  }
  const { sessionId, ...question } = body;
  if (typeof sessionId !== "string" || !sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await streamAssistant(sessionId, question, request.signal);
  } catch (err) {
    if (err instanceof BackendAuthError) {
      return NextResponse.json({ error: "Your sign-in has expired — sign in again to continue." }, { status: 401 });
    }
    return NextResponse.json({ error: "The AI service didn't answer — try again." }, { status: 502 });
  }

  // Either the event stream, or the backend's own JSON error with its status
  // (assistant switched off, message limit reached, …) — passed on as it is.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
