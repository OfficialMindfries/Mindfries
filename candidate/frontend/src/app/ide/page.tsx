import type { Metadata } from "next";
import { IdeShell } from "@/components/ide/IdeShell";

export const metadata: Metadata = {
  title: "Mindfries Workspace",
  description: "In-browser code editor with file explorer and terminal.",
};

export default async function IdePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  return <IdeShell sessionId={session} />;
}
