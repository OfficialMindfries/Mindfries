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
