// The rules behind the Targets panel, kept pure so both storage backends
// (Supabase and the local file) behave identically, and so they can be checked
// on their own: `npx --yes tsx lib/targets.test.mts`.
//
// Everything here is deliberately visible to the person using the panel.
// Nothing moves a deal behind anyone's back: an automatic stage change only
// ever goes *forward* through the early pipeline, and only on a touch someone
// just logged; a follow-up is proposed in the form, never set silently.

import type {
  TargetCompany, TargetContact, TargetPriority, TargetStage, TouchChannel,
  TouchDirection, TouchOutcome,
} from "./types";

export const STAGES: { key: TargetStage; label: string }[] = [
  { key: "researching", label: "Researching" },
  { key: "contacted", label: "Contacted" },
  { key: "conversation", label: "In conversation" },
  { key: "meeting", label: "Meeting booked" },
  { key: "demo", label: "Demo done" },
  { key: "pilot", label: "Pilot" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "nurture", label: "Nurture" },
];
export const stageLabel = Object.fromEntries(STAGES.map((s) => [s.key, s.label])) as Record<TargetStage, string>;

/** Decided — no follow-up is owed on these. */
export const CLOSED: TargetStage[] = ["won", "lost"];
/** Being actively worked: can go cold. Nurture is parked on purpose, so it can't. */
export const ACTIVE: TargetStage[] = ["researching", "contacted", "conversation", "meeting", "demo", "pilot"];
/** "In conversation" and beyond, short of a decision. */
export const ENGAGED: TargetStage[] = ["conversation", "meeting", "demo", "pilot"];

const order = (s: TargetStage) => ACTIVE.indexOf(s);

export const priorityRank: Record<TargetPriority, number> = { A: 0, B: 1, C: 2 };

export const GOING_COLD_DAYS = 14;
export const FOLLOW_UP_WORKING_DAYS = 3;

// ── Dates ───────────────────────────────────────────────────────────────────
// Due dates are calendar days, not instants, so "today" has to be a calendar
// day in the team's timezone — a server running in UTC would otherwise flip a
// follow-up to "overdue" at 5:30 in the morning, Indian time.

/** Today as YYYY-MM-DD in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Adds working days (Mon–Fri) to a YYYY-MM-DD date. */
export function addWorkingDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`); // noon UTC: no DST edge can shift the date
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromDay: string, toDay: string): number {
  const ms = new Date(`${toDay}T12:00:00Z`).getTime() - new Date(`${fromDay}T12:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

// ── What needs attention ────────────────────────────────────────────────────

export function isOverdue(t: Pick<TargetCompany, "stage" | "nextActionDue">, today: string): boolean {
  return !CLOSED.includes(t.stage) && !!t.nextActionDue && t.nextActionDue < today;
}

export function isDueToday(t: Pick<TargetCompany, "stage" | "nextActionDue">, today: string): boolean {
  return !CLOSED.includes(t.stage) && t.nextActionDue === today;
}

/**
 * Being worked, but nobody has touched it in GOING_COLD_DAYS. A target that was
 * added and never contacted counts from the day it was added — sitting in
 * "Researching" for two weeks is exactly the kind of stall this should catch.
 */
export function isGoingCold(
  t: Pick<TargetCompany, "stage" | "lastTouchAt" | "createdAt">,
  today: string,
  timeZone: string,
): boolean {
  if (!ACTIVE.includes(t.stage)) return false;
  const since = todayIn(timeZone, new Date(t.lastTouchAt ?? t.createdAt));
  return daysBetween(since, today) >= GOING_COLD_DAYS;
}

/**
 * Order for the main table: what's late first (most late at the top), then
 * what's due today, then upcoming by date, then targets with no next step at
 * all. Within a tie, priority, then name.
 */
export function sortForAttention(list: TargetCompany[], today: string): TargetCompany[] {
  const bucket = (t: TargetCompany) =>
    CLOSED.includes(t.stage) ? 4 : isOverdue(t, today) ? 0 : isDueToday(t, today) ? 1 : t.nextActionDue ? 2 : 3;
  return [...list].sort(
    (a, b) =>
      bucket(a) - bucket(b) ||
      (a.nextActionDue ?? "9999").localeCompare(b.nextActionDue ?? "9999") ||
      priorityRank[a.priority] - priorityRank[b.priority] ||
      a.name.localeCompare(b.name),
  );
}

// ── Logging a touch ─────────────────────────────────────────────────────────

export interface TouchInput {
  channel: TouchChannel;
  direction: TouchDirection | null;
  outcome: TouchOutcome | null;
  happenedAt: string; // ISO
}

/**
 * What a logged touch does to its target. Deliberately conservative:
 *
 * - A note isn't contact with the company, so it changes nothing — including
 *   the "last touched" clock that decides whether a deal is going cold.
 * - Stages only move forward, and only through the early pipeline. Reaching
 *   out moves Researching to Contacted; a reply moves an early deal to In
 *   conversation; a booked meeting moves it to Meeting booked. A target past
 *   those points is left where someone put it.
 * - A decline moves nothing. One person saying no isn't the company saying
 *   no, and "Lost" should be a decision, not a side effect.
 * - A nurture target that replies has re-engaged, so it rejoins the pipeline.
 * - Won and lost are never changed by a touch.
 * - Backdating a touch never moves "last touched" backwards.
 */
export function applyTouch(
  t: Pick<TargetCompany, "stage" | "lastTouchAt">,
  touch: TouchInput,
): { stage?: TargetStage; lastTouchAt?: string } {
  if (touch.channel === "note" || !touch.direction) return {};

  const patch: { stage?: TargetStage; lastTouchAt?: string } = {};
  if (!t.lastTouchAt || touch.happenedAt > t.lastTouchAt) patch.lastTouchAt = touch.happenedAt;

  if (CLOSED.includes(t.stage)) return patch;

  const advanceTo = (to: TargetStage) => {
    if (t.stage === "nurture" || order(t.stage) < order(to)) patch.stage = to;
  };

  if (touch.direction === "outbound") {
    if (t.stage === "researching") patch.stage = "contacted";
  } else if (touch.outcome === "meeting_booked") {
    advanceTo("meeting");
  } else if (touch.outcome === "replied") {
    advanceTo("conversation");
  }
  return patch;
}

/** The follow-up the log form pre-fills after an outbound touch. Editable; never applied silently. */
export function proposedFollowUp(today: string, contactName?: string | null): { action: string; due: string } {
  return {
    action: contactName ? `Follow up with ${contactName}` : "Follow up",
    due: addWorkingDays(today, FOLLOW_UP_WORKING_DAYS),
  };
}

const CHANNEL_LABEL: Record<TouchChannel, string> = {
  email: "Email", linkedin: "LinkedIn", call: "Call", meeting: "Meeting", intro: "Intro", event: "Event", note: "Note",
};
export const channelLabel = CHANNEL_LABEL;

/** One line for the list view's "last touch" column. */
export function touchSummary(
  touch: Pick<TouchInput, "channel" | "direction" | "outcome">,
  contact?: Pick<TargetContact, "name"> | null,
): string {
  const who = contact?.name ? ` · ${contact.name}` : "";
  if (touch.direction === "inbound") {
    const what = touch.outcome === "meeting_booked" ? "booked a meeting" : touch.outcome === "declined" ? "declined" : "replied";
    return `${CHANNEL_LABEL[touch.channel]} · ${contact?.name ?? "They"} ${what}`;
  }
  return `${CHANNEL_LABEL[touch.channel]} sent${who}`;
}

// ── "Is this the same company?" ─────────────────────────────────────────────
// One rule, used against targets, crawled leads and onboarded companies, so
// "Razorpay", "razorpay" and "Razorpay Pvt. Ltd." are one company. Only
// legal-entity suffixes are stripped: words like "Software", "Labs" or
// "Technologies" are often the actual name, and stripping them would merge
// different firms — so "Razorpay Software" stays distinct from "Razorpay",
// and a matching website is what catches that pair.

const LEGAL_SUFFIXES = new Set([
  "inc", "incorporated", "llc", "llp", "ltd", "limited", "pvt", "private", "plc",
  "gmbh", "ag", "sa", "bv", "corp", "corporation", "co", "company",
]);

export function companyKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(" ");
}

/** "https://www.acme.io/careers" → "acme.io". Empty or unparseable → null. */
export function websiteHost(website: string | null | undefined): string | null {
  const raw = (website ?? "").trim();
  if (!raw) return null;
  try {
    const host = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export interface KnownCompany {
  kind: "target" | "lead" | "onboarded";
  id: string;
  name: string;
  website?: string | null;
}

/** The first known company that's the same as `candidate` by name or website host, if any. */
export function findDuplicate(
  candidate: { name: string; website?: string | null },
  known: KnownCompany[],
): KnownCompany | null {
  const key = companyKey(candidate.name);
  const host = websiteHost(candidate.website);
  return (
    known.find(
      (k) => (key && companyKey(k.name) === key) || (host && websiteHost(k.website) === host),
    ) ?? null
  );
}

// ── Labels ──────────────────────────────────────────────────────────────────

/** "today", "yesterday", "5d ago", or a date for anything past a month. */
export function whenLabel(iso: string, today: string, timeZone: string): string {
  const day = todayIn(timeZone, new Date(iso));
  const d = daysBetween(day, today);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "Overdue 3d", "Due today", "Tomorrow", "In 4d", or a date past a fortnight. */
export function dueLabel(due: string, today: string): string {
  const d = daysBetween(today, due);
  if (d < 0) return `Overdue ${-d}d`;
  if (d === 0) return "Due today";
  if (d === 1) return "Tomorrow";
  if (d <= 14) return `In ${d}d`;
  return new Date(`${due}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
