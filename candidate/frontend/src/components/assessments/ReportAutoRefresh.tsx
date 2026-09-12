"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While a report is still `pending`/`generating`, the evaluation pipeline is
 * running server-side (candidate/backend's orchestrator) with nothing on
 * this page to react to it — so this polls the only way a Server Component
 * page can "watch" something change: re-fetch the page itself, on an
 * interval, until the parent stops rendering this (a terminal status).
 * A real WebSocket subscription (the backend's own hub already broadcasts
 * `report_ready`/`report_failed`) is the better long-term fix; this is the
 * honest short one that doesn't require a browser-side WS client yet.
 */
export function ReportAutoRefresh({ intervalMs = 3000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
