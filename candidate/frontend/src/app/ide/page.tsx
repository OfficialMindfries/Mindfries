import type { Metadata } from "next";
import { IdeShell } from "@/components/ide/IdeShell";

export const metadata: Metadata = {
  title: "Mindfries Workspace",
  description: "In-browser code editor with file explorer and terminal.",
};

export default function IdePage() {
  return <IdeShell />;
}
