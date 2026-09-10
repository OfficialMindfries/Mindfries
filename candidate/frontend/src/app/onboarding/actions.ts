"use server";

import { redirect } from "next/navigation";
import { startSession as dbStart } from "@/lib/db";
import { supabaseReady } from "@/lib/supabase";

/**
 * Called from the final Lobby step when the candidate clicks "Enter Workspace".
 * This is the moment the live session is created in the database — not when
 * "Start assessment" is clicked on the dashboard, and not when the onboarding
 * wizard opens. The timer and evidence capture begin from here.
 */
export async function enterWorkspace() {
  if (supabaseReady()) {
    try {
      // TODO: pass real candidate auth + templateId once auth lands
      await dbStart("default", "Rishi");
    } catch {
      // Don't block entry if the write fails — the workspace opens either way
    }
  }
  redirect("/ide");
}
