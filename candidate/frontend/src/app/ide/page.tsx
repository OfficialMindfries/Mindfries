import type { Metadata } from "next";
import { IdeShell } from "@/components/ide/IdeShell";
import { currentCandidate } from "@/lib/auth/users";
import { getSessionAssessmentOrUndefined } from "@/lib/backend/client";

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
  const assessment = session ? await getSessionAssessmentOrUndefined(session) : undefined;
  return (
    <IdeShell
      sessionId={session}
      candidateName={candidate?.name}
      taskBrief={assessment?.taskBrief}
      starterFiles={assessment?.starterFiles}
    />
  );
}

