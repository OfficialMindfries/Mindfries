/**
 * Telemetry buffer — batches events client-side and flushes them to
 * candidate/backend's real ingestion endpoint (POST /api/v1/sessions/{id}/events,
 * via the same-origin /api/telemetry route so the browser's session cookie
 * comes along) rather than sending one request per event.
 *
 * Scope, stated plainly rather than implied: this captures git/npm/pip
 * activity and preview-build results (via the existing Output-channel store,
 * lib/ide/output.ts) and file saves. It does NOT capture every raw terminal
 * command line — that would mean touching vfs-shell.ts's line editor, the
 * one part of this feature with the heaviest existing test coverage (30/30
 * shell cases, 18/18 git cases) and the most documented automation
 * fragility (see the IDE's own CLAUDE.md). Real, useful signal starts
 * flowing without touching that surface; full command-level capture is a
 * deliberate follow-up, not an oversight.
 *
 * No React, no DOM beyond `fetch`/`navigator.sendBeacon` — same
 * "plain module, React binds to it" shape as output.ts, so it's usable
 * from anywhere without dragging a component along.
 */

export interface TelemetryEvent {
  type: string;
  payload: unknown;
}

const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 25;

export class TelemetryBuffer {
  private queue: TelemetryEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(private readonly sessionId: string) {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  record(type: string, payload: unknown): void {
    if (this.destroyed) return;
    this.queue.push({ type, payload });
    if (this.queue.length >= MAX_BATCH) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    try {
      const res = await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.sessionId, events: batch }),
        keepalive: true, // survives a navigation that starts right after this call
      });
      if (!res.ok) {
        // Real evidence lost silently would be worse than noisy — but this
        // is a workspace mid-assessment, not a place to surface a toast
        // over a dropped telemetry batch. Logged for whoever's watching
        // devtools; not retried, since a stale batch retried later would
        // land out of order.
        console.warn("telemetry: flush failed", res.status);
      }
    } catch (err) {
      console.warn("telemetry: flush failed", err);
    }
  }

  /** Stops the interval and sends whatever's left with sendBeacon, which
   * (unlike fetch) is designed to survive the page actually going away. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.queue.length > 0 && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/telemetry",
        new Blob([JSON.stringify({ sessionId: this.sessionId, events: this.queue })], { type: "application/json" })
      );
      this.queue = [];
    }
  }
}
