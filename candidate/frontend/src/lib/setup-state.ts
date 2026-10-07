import "server-only";
import { db } from "./supabase";

// The two setup steps the dashboard asks for besides the profile: an
// environment check and a practice run (0019_invitations_and_setup.sql).

export interface SetupState {
  /** When the last environment check that passed was run, or null. */
  environmentCheckedAt: string | null;
  /** How many practice runs the candidate has opened. */
  practiceRuns: number;
}

export const NO_SETUP: SetupState = { environmentCheckedAt: null, practiceRuns: 0 };

export async function getSetupState(candidateId: string | undefined): Promise<SetupState> {
  const c = db();
  if (!c || !candidateId) return NO_SETUP;
  const [user, runs] = await Promise.all([
    c.from("candidate_users").select("environment_checked_at").eq("id", candidateId).maybeSingle(),
    c.from("practice_runs").select("id", { count: "exact", head: true }).eq("candidate_id", candidateId),
  ]);
  return {
    environmentCheckedAt: (user.data?.environment_checked_at as string | null) ?? null,
    practiceRuns: runs.count ?? 0,
  };
}
