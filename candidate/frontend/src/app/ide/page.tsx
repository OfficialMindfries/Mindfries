import type { Metadata } from "next";
import { IdeShell } from "@/components/ide/IdeShell";
import { currentCandidate } from "@/lib/auth/users";

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
  return <IdeShell sessionId={session} candidateName={candidate?.name} />;
}

