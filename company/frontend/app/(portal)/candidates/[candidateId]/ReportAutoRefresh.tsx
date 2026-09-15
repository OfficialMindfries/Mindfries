"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Same mechanic as candidate/frontend's own ReportAutoRefresh — while a
 * report is still pending/generating, the evaluation pipeline runs
 * server-side with nothing here to react to, so this re-fetches the page
 * on an interval until the parent stops rendering it (a terminal status).
 */
export function ReportAutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
