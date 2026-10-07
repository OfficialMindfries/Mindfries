import type { Metadata } from "next";
import { IdeShell } from "@/components/ide/IdeShell";
import { currentCandidate } from "@/lib/auth/users";
import { getSessionAssessmentOrUndefined, getSessionOrUndefined, secondsRemaining } from "@/lib/backend/client";

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
  const [assessment, live] = session
    ? await Promise.all([getSessionAssessmentOrUndefined(session), getSessionOrUndefined(session)])
    : [undefined, undefined];
  // What's really left on this session's clock, measured from when it
  // started — a reload doesn't hand the candidate their time back.
  const remainingSeconds = live ? secondsRemaining(live) : undefined;
  return (
    <IdeShell
      sessionId={session}
      candidateName={candidate?.name}
      assessmentName={assessment?.name}
      remainingSeconds={remainingSeconds}
      taskBrief={assessment?.taskBrief}
      starterFiles={assessment?.starterFiles}
    />
  );
}

