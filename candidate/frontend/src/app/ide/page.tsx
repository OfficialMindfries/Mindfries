import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { IdeShell } from "@/components/ide/IdeShell";
import { currentCandidate } from "@/lib/auth/users";
import { getSavedWorkspaceOrUndefined, getSessionAssessmentOrUndefined, getSessionOrMissing, secondsRemaining } from "@/lib/backend/client";
import { PRACTICE_BRIEF, PRACTICE_FILES, PRACTICE_NAME } from "@/lib/ide/practice-task";

export const metadata: Metadata = {
  title: "Mindfries Workspace",
  description: "In-browser code editor with file explorer and terminal.",
};

export default async function IdePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; practice?: string }>;
}) {
  const [{ session, practice }, candidate] = await Promise.all([searchParams, currentCandidate()]);
  // A practice run (app/practice): the same workspace on a throwaway task,
  // with no session — so nothing in it is timed, recorded or submitted.
  if (!session && practice) {
    return <IdeShell practice candidateName={candidate?.name} assessmentName={PRACTICE_NAME} taskBrief={PRACTICE_BRIEF} starterFiles={PRACTICE_FILES} />;
  }
  // Fetched here, server-side, before the IDE ever renders — not from
  // inside IdeShell — so the workspace's very first paint already has the
  // real starting files/brief (or the honest fallback) rather than
  // flashing empty/mock content while a client-side fetch resolves.
  const [assessment, found, saved] = session
    ? await Promise.all([getSessionAssessmentOrUndefined(session), getSessionOrMissing(session), getSavedWorkspaceOrUndefined(session)])
    : [undefined, undefined, undefined];
  // A session id the backend says isn't this candidate's — someone else's,
  // mistyped, invented — has no workspace. It used to open one anyway,
  // titled "Assessment" and blaming a missing task brief on "a setup gap on
  // our end", which invited work that could never be submitted.
  if (found === "missing") notFound();
  const live = found;
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
      // A real machine behind this session (candidate/backend made one when
      // it started), or the in-browser workspace when there isn't.
      sandbox={!!live?.sandbox}
      taskBrief={assessment?.taskBrief}
      starterFiles={assessment?.starterFiles}
      // The server's copy of this session's work, if it has one — what a
      // browser that has never seen the session (or has lost it) opens with.
      serverWorkspace={saved ? { files: saved.files, savedAt: Date.parse(saved.savedAt), frozen: saved.frozen } : undefined}
    />
  );
}

