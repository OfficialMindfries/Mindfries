import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IdeShell } from "@/components/ide/IdeShell";
import { currentCandidate } from "@/lib/auth/users";
import { getSavedWorkspaceOrUndefined, getSessionAssessmentOrUndefined, getSessionOrUndefined, secondsRemaining } from "@/lib/backend/client";

export const metadata: Metadata = {
  title: "Mindfries Workspace",
  description: "In-browser code editor with file explorer and terminal.",
};

export default async function IdePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const [{ session }, candidate] = await Promise.all([searchParams, currentCandidate()]);
  // Fetched here, server-side, before the IDE ever renders — not from
  // inside IdeShell — so the workspace's very first paint already has the
  // real starting files/brief (or the honest fallback) rather than
  // flashing empty/mock content while a client-side fetch resolves.
  const [assessment, live, saved] = session
    ? await Promise.all([getSessionAssessmentOrUndefined(session), getSessionOrUndefined(session), getSavedWorkspaceOrUndefined(session)])
    : [undefined, undefined, undefined];
  // What's really left on this session's clock, measured from when it
  // started — a reload doesn't hand the candidate their time back.
  // A session that's been submitted has no workspace to return to — its
  // evidence is fixed, and anything typed here would go nowhere.
  if (session && live && live.status !== "live") {
    redirect(`/assessments/${encodeURIComponent(session)}/report`);
  }
  const remainingSeconds = live ? secondsRemaining(live) : undefined;
  return (
    <IdeShell
      sessionId={session}
      candidateName={candidate?.name}
      assessmentName={assessment?.name}
      remainingSeconds={remainingSeconds}
      taskBrief={assessment?.taskBrief}
      starterFiles={assessment?.starterFiles}
      // The server's copy of this session's work, if it has one — what a
      // browser that has never seen the session (or has lost it) opens with.
      serverWorkspace={saved ? { files: saved.files, savedAt: Date.parse(saved.savedAt), frozen: saved.frozen } : undefined}
    />
  );
}

