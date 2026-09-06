"use server";

import { redirect } from "next/navigation";
import { startSession as dbStart } from "@/lib/db";
import { supabaseReady } from "@/lib/supabase";

// Candidate clicks "Start assessment" → create a live session (visible in the
// internal-admin Session Monitor), then drop them into the workspace.
// ponytail: no candidate auth yet, so the name is a placeholder — wire to the
// signed-in user when auth lands.
export async function startAssessment(templateId: string) {
  if (supabaseReady()) {
    try {
      await dbStart(templateId, "Rishi");
    } catch {
      // don't block entry to the workspace if the write fails
    }
  }
  redirect("/ide");
}
