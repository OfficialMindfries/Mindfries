import type { Tone } from "@/lib/format";
import type {
  ContactPersona, ContactWarmth, TargetPriority, TargetSource, TargetStage, TouchChannel, TouchOutcome,
} from "@/lib/types";

export const stageTone: Record<TargetStage, Tone> = {
  researching: "gray",
  contacted: "violet",
  conversation: "violet",
  meeting: "amber",
  demo: "amber",
  pilot: "amber",
  won: "green",
  lost: "coral",
  nurture: "gray",
};

export const priorityTone: Record<TargetPriority, Tone> = { A: "coral", B: "amber", C: "gray" };

export const sourceLabel: Record<TargetSource, string> = {
  warm_intro: "Warm intro",
  event: "Event",
  linkedin: "LinkedIn",
  referral: "Referral",
  tracker: "From Tracker",
  other: "Other",
};

export const personaLabel: Record<ContactPersona, string> = {
  decision_maker: "Decision-maker",
  champion: "Champion",
  influencer: "Influencer",
  recruiter: "Recruiter / TA",
  other: "Other",
};

export const warmthLabel: Record<ContactWarmth, string> = { cold: "Cold", warm: "Warm", intro: "Intro'd" };

export const channelIcon: Record<TouchChannel, string> = {
  email: "✉", linkedin: "in", call: "☏", meeting: "◷", intro: "⇄", event: "◎", note: "✎",
};

export const outcomeLabel: Record<TouchOutcome, string> = {
  replied: "Replied",
  meeting_booked: "Booked a meeting",
  declined: "Declined",
};

// The logo tile: initials on a colour picked from the name. Deterministic, so
// a company keeps its colour. Real logos would mean sending every prospect's
// domain to a third-party favicon service, which isn't worth it for a tile.
const TILES = [
  "bg-[#e7f7ec] text-[#23894a]", "bg-[#fde8ef] text-[#c2275a]", "bg-[#e8f1fe] text-[#2f5fc4]",
  "bg-[#efeafd] text-[#6a45d8]", "bg-[#fff1e3] text-[#c26410]", "bg-[#e3f7f6] text-[#11807a]",
  "bg-[#fcecea] text-[#c23a2b]", "bg-[#eef0f4] text-[#4b5563]",
];
export function tileFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILES[h % TILES.length];
}
export function initialsOf(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}
