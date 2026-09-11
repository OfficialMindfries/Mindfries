// Run: npx --yes tsx lib/targets.test.mts
import assert from "node:assert/strict";
import {
  addWorkingDays, applyTouch, companyKey, findDuplicate, isDueToday, isGoingCold, isOverdue,
  proposedFollowUp, sortForAttention, todayIn, touchSummary, websiteHost,
} from "./targets-rules.ts";
import type { TargetCompany } from "./types.ts";

const TZ = "Asia/Kolkata";
const base: TargetCompany = {
  id: "t", name: "Acme", website: null, priority: "B", stage: "researching", whyTarget: "", notes: "",
  source: "other", owner: null, nextAction: null, nextActionDue: null, lastTouchAt: null,
  lastTouchSummary: null, leadId: null, createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-01T09:00:00.000Z",
};
const touch = (o: Partial<Parameters<typeof applyTouch>[1]>) =>
  ({ channel: "email", direction: "outbound", outcome: null, happenedAt: "2026-09-10T10:00:00.000Z", ...o }) as Parameters<typeof applyTouch>[1];

// ── Dates ──
// 19:00 UTC is already tomorrow in India: a UTC server must not call it today.
assert.equal(todayIn(TZ, new Date("2026-09-11T19:00:00Z")), "2026-09-12", "today is a calendar day in the team's timezone");
assert.equal(addWorkingDays("2026-09-11", 3), "2026-09-16", "Fri + 3 working days skips the weekend to Wed");
assert.equal(addWorkingDays("2026-09-14", 1), "2026-09-15", "Mon + 1 is Tue");
assert.equal(proposedFollowUp("2026-09-11", "Priya").action, "Follow up with Priya");

// ── Attention ──
assert.ok(isOverdue({ ...base, nextActionDue: "2026-09-10" }, "2026-09-11"), "a past due date is overdue");
assert.ok(!isOverdue({ ...base, nextActionDue: "2026-09-11" }, "2026-09-11"), "due today is not overdue");
assert.ok(isDueToday({ ...base, nextActionDue: "2026-09-11" }, "2026-09-11"));
assert.ok(!isOverdue({ ...base, stage: "won", nextActionDue: "2026-09-01" }, "2026-09-11"), "a decided deal owes no follow-up");

assert.ok(isGoingCold({ ...base, lastTouchAt: "2026-08-20T10:00:00Z" }, "2026-09-11", TZ), "22 days untouched is going cold");
assert.ok(!isGoingCold({ ...base, lastTouchAt: "2026-09-05T10:00:00Z" }, "2026-09-11", TZ), "6 days is fine");
assert.ok(isGoingCold({ ...base, createdAt: "2026-08-01T10:00:00Z" }, "2026-09-11", TZ), "never contacted counts from creation");
assert.ok(!isGoingCold({ ...base, stage: "nurture", lastTouchAt: "2026-06-01T10:00:00Z" }, "2026-09-11", TZ), "nurture is parked on purpose");

const sorted = sortForAttention(
  [
    { ...base, id: "later", name: "Later", nextActionDue: "2026-09-20" },
    { ...base, id: "none", name: "None" },
    { ...base, id: "won", name: "Won", stage: "won", nextActionDue: "2026-09-01" },
    { ...base, id: "late", name: "Late", nextActionDue: "2026-09-02" },
    { ...base, id: "today", name: "Today", nextActionDue: "2026-09-11" },
  ],
  "2026-09-11",
).map((t) => t.id);
assert.deepEqual(sorted, ["late", "today", "later", "none", "won"], "late, today, upcoming, no step, decided");

// ── Touch rules ──
assert.deepEqual(applyTouch(base, touch({ channel: "note", direction: null })), {}, "a note changes nothing, not even last-touched");
assert.equal(applyTouch(base, touch({})).stage, "contacted", "reaching out moves Researching to Contacted");
assert.equal(applyTouch({ ...base, stage: "contacted" }, touch({})).stage, undefined, "a second outbound touch doesn't move it");
assert.equal(applyTouch({ ...base, stage: "contacted" }, touch({ direction: "inbound", outcome: "replied" })).stage, "conversation");
assert.equal(applyTouch(base, touch({ direction: "inbound", outcome: "meeting_booked" })).stage, "meeting");
assert.equal(applyTouch({ ...base, stage: "demo" }, touch({ direction: "inbound", outcome: "replied" })).stage, undefined, "never moves a deal backwards");
assert.equal(applyTouch({ ...base, stage: "conversation" }, touch({ direction: "inbound", outcome: "declined" })).stage, undefined, "one decline isn't Lost");
assert.equal(applyTouch({ ...base, stage: "nurture" }, touch({ direction: "inbound", outcome: "replied" })).stage, "conversation", "a nurture reply rejoins");
assert.equal(applyTouch({ ...base, stage: "won" }, touch({ direction: "inbound", outcome: "replied" })).stage, undefined, "won is final");
assert.equal(applyTouch({ ...base, stage: "lost" }, touch({})).stage, undefined, "lost is final");
assert.equal(
  applyTouch({ ...base, lastTouchAt: "2026-09-10T10:00:00.000Z" }, touch({ happenedAt: "2026-09-01T10:00:00.000Z" })).lastTouchAt,
  undefined,
  "backdating a touch never moves last-touched backwards",
);
assert.equal(touchSummary({ channel: "linkedin", direction: "outbound", outcome: null }, { name: "Priya" }), "LinkedIn sent · Priya");
assert.equal(touchSummary({ channel: "email", direction: "inbound", outcome: "meeting_booked" }, { name: "Priya" }), "Email · Priya booked a meeting");

// ── Same company? ──
assert.equal(companyKey("Razorpay Pvt. Ltd."), "razorpay", "legal suffixes and punctuation go");
assert.equal(companyKey("  RAZORPAY  "), "razorpay");
assert.notEqual(companyKey("Razorpay Software"), companyKey("Razorpay"), "a real word in the name is kept");
assert.equal(companyKey("Co"), "co", "a name that is only a suffix word isn't emptied");
assert.equal(websiteHost("https://www.Acme.io/careers?x=1"), "acme.io");
assert.equal(websiteHost("acme.io"), "acme.io");
assert.equal(websiteHost(""), null);

const known = [
  { kind: "lead" as const, id: "l1", name: "Razorpay", website: "razorpay.com" },
  { kind: "onboarded" as const, id: "o1", name: "Zepto" },
];
assert.equal(findDuplicate({ name: "Razorpay Pvt Ltd" }, known)?.id, "l1", "same company by name");
assert.equal(findDuplicate({ name: "Razorpay Software", website: "https://razorpay.com" }, known)?.id, "l1", "same company by website");
assert.equal(findDuplicate({ name: "zepto" }, known)?.kind, "onboarded");
assert.equal(findDuplicate({ name: "Swiggy" }, known), null);

console.log("targets rules: all checks passed");
