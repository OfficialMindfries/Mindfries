"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While a report is still `pending`/`generating`, the evaluation pipeline is
 * running server-side (candidate/backend's orchestrator). This keeps the page
 * current until the parent stops rendering it (a terminal status).
 *
 * It listens rather than asks: the backend broadcasts `report_generating`,
 * `report_ready` and `report_failed` to the session's event stream as they
 * happen, and the page re-fetches itself the moment one arrives. `live` is
 * the stream's address and a one-minute ticket for it, minted server-side
 * for this render (the page's cookie can't be sent to the backend's origin).
 *
 * Polling stays as the fallback, not the mechanism: slowly while the stream
 * is connected — a missed message, or a proxy that quietly dropped the
 * socket, still gets caught — and at the old rate when it isn't, which is
 * also what happens when there is no stream to connect to.
 */

const POLL_MS = 3000;
const POLL_WHILE_LISTENING_MS = 20_000;
const REPORT_EVENTS = new Set(["report_generating", "report_ready", "report_failed", "session_submitted"]);

export function ReportAutoRefresh({ live }: { live?: { url: string; ticket: string } }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const poll = (ms: number) => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => router.refresh(), ms);
    };
    poll(POLL_MS);

    let socket: WebSocket | null = null;
    if (live && typeof WebSocket !== "undefined") {
      try {
        socket = new WebSocket(live.url);
        socket.onopen = () => {
          socket?.send(JSON.stringify({ ticket: live.ticket }));
          poll(POLL_WHILE_LISTENING_MS);
        };
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(String(event.data)) as { type?: string };
            if (message.type && REPORT_EVENTS.has(message.type)) router.refresh();
          } catch {
            // not ours to read
          }
        };
        // Refused, dropped, or the ticket had lapsed: back to asking.
        socket.onclose = () => poll(POLL_MS);
      } catch {
        socket = null;
      }
    }

    return () => {
      if (timer) clearInterval(timer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
    // The ticket is new on every render; reconnecting for each would defeat
    // the point. One connection per mount, to the address it was given first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, live?.url]);

  return null;
}
