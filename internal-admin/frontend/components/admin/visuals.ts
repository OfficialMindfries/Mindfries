import { Bug, CodeXml, Database, Zap, type LucideIcon } from "lucide-react";
import type { TaskVariant } from "@/lib/types";

// Small visual vocabulary shared across admin pages, so a game type or a
// person looks the same wherever they appear.

/** Icon and tile colour for each kind of assessment game. */
export const VARIANT: Record<TaskVariant, { icon: LucideIcon; tile: string }> = {
  bug_fix: { icon: Bug, tile: "bg-[#fff0e8] text-[#d9601a]" },
  feature: { icon: Zap, tile: "bg-[#e3f7ec] text-[#1b8f4e]" },
  refactor: { icon: Database, tile: "bg-[#e7f0ff] text-[#2f6fe4]" },
  debug: { icon: CodeXml, tile: "bg-[#efeafd] text-[#7c3aed]" },
};

const AVATARS = [
  "bg-[#ffe9ea] text-[#c23a42]", "bg-[#fff1e3] text-[#c26410]", "bg-[#e7f0ff] text-[#2f5fc4]",
  "bg-[#efeafd] text-[#6a45d8]", "bg-[#e3f7ec] text-[#1b8f4e]", "bg-[#e0f6f4] text-[#11807a]",
];

/** A stable avatar colour from a name, so a person keeps theirs. */
export function avatarFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

export const initials = (name: string) =>
  name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
