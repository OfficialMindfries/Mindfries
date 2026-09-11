"use client";

import { useEffect } from "react";
import { toast } from "./toast";

/**
 * "Backend not connected" — as a notification in the corner, raised once from
 * the admin layout, instead of a card at the top of every page.
 *
 * Once per browser session, keyed on what's missing: moving between pages
 * doesn't bring it back, but it reappears in a new session, or if a different
 * set of keys goes missing. It stays until closed, because it's the one
 * notification that explains why things look empty.
 */
export function SetupToast({ missing }: { missing: string[] }) {
  const signature = missing.join("|");
  useEffect(() => {
    if (!signature) return;
    const key = `mindfries.admin.setup-toast:${signature}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked: show it anyway rather than hide a setup problem.
    }
    toast.warning(
      "Backend not connected yet",
      `Set ${signature.split("|").join(" · ")} to go live. See internal-admin/frontend/.env.example and TRACKER_SETUP.md.`,
    );
  }, [signature]);
  return null;
}
