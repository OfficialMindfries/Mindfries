"use server";

import { revalidatePath } from "next/cache";
import { listLeads, listOnboarded } from "@/lib/db";
import { targetsStore, type TargetPatch } from "@/lib/targets-store";
import { applyTouch, findDuplicate, touchSummary, type KnownCompany } from "@/lib/targets-rules";
import type {
  ContactPersona, ContactWarmth, TargetPriority, TargetSource, TargetStage, TouchChannel,
  TouchDirection, TouchOutcome,
} from "@/lib/types";

// Every write the Targets panel makes goes through here.
//
// Inputs are validated as if they came from anyone, because until the admin
// panel has a login, they can: a server action is an HTTP endpoint, and its
// ID ships in the page's JavaScript. So strings are trimmed and length-capped,
// and every enum is checked against its allowed values rather than trusted.

type Fail = { ok: false; error: string; duplicate?: { kind: KnownCompany["kind"]; id: string; name: string } };
type Ok<T = object> = { ok: true } & T;

const STAGES: TargetStage[] = ["researching", "contacted", "conversation", "meeting", "demo", "pilot", "won", "lost", "nurture"];
const PRIORITIES: TargetPriority[] = ["A", "B", "C"];
const SOURCES: TargetSource[] = ["warm_intro", "event", "linkedin", "referral", "tracker", "other"];
const PERSONAS: ContactPersona[] = ["decision_maker", "champion", "influencer", "recruiter", "other"];
const WARMTH: ContactWarmth[] = ["cold", "warm", "intro"];
const CHANNELS: TouchChannel[] = ["email", "linkedin", "call", "meeting", "intro", "event", "note"];
const OUTCOMES: TouchOutcome[] = ["replied", "meeting_booked", "declined"];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Invalid ${field}`);
}
function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function optText(value: unknown, max: number): string | null {
  return text(value, max) || null;
}
function optDay(value: unknown): string | null {
  const v = text(value, 10);
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new Error("Invalid date");
  return v;
}
function optEmail(value: unknown): string | null {
  const v = text(value, 254);
  if (!v) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error("That email address doesn't look right");
  return v;
}
function optUrl(value: unknown): string | null {
  const v = text(value, 500);
  if (!v) return null;
  const withScheme = /^[a-z]+:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    // Only web links: these are rendered as <a href>, and a `javascript:` URL
    // saved here would run in whoever clicks it.
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return u.toString();
  } catch {
    throw new Error("That link doesn't look right");
  }
}

const fail = (e: unknown): Fail => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

function refresh(targetId?: string) {
  revalidatePath("/admin/targets");
  if (targetId) revalidatePath(`/admin/targets/${targetId}`);
}

/** Every company we already know about: targets, crawled leads, onboarded customers. */
async function knownCompanies(): Promise<KnownCompany[]> {
  const [targets, leads, onboarded] = await Promise.all([
    targetsStore().listTargets(),
    listLeads(),
    listOnboarded(),
  ]);
  return [
    ...targets.map((t) => ({ kind: "target" as const, id: t.id, name: t.name, website: t.website })),
    ...leads.map((l) => ({ kind: "lead" as const, id: l.id, name: l.company, website: l.domain })),
    ...onboarded.map((o) => ({ kind: "onboarded" as const, id: o.id, name: o.company })),
  ];
}

interface ContactInput {
  name?: unknown; role?: unknown; email?: unknown; linkedinUrl?: unknown;
  persona?: unknown; warmth?: unknown; notes?: unknown;
}

function cleanContact(c: ContactInput) {
  const name = text(c.name, 120);
  if (!name) throw new Error("A person needs a name");
  return {
    name,
    role: optText(c.role, 120),
    email: optEmail(c.email),
    linkedinUrl: optUrl(c.linkedinUrl),
    persona: c.persona ? oneOf(c.persona, PERSONAS, "role in the deal") : ("other" as const),
    warmth: c.warmth ? oneOf(c.warmth, WARMTH, "warmth") : ("cold" as const),
    doNotContact: false,
    notes: optText(c.notes, 1000),
  };
}

/**
 * Adds a target. The same company can't be added twice, and it can't be a
 * customer already. If it's a company the crawler found, the target is linked
 * to that lead instead of refused — that's the one-click path from the Tracker,
 * arrived at by typing the name.
 */
export async function createTarget(input: {
  name?: unknown; website?: unknown; priority?: unknown; source?: unknown; owner?: unknown;
  whyTarget?: unknown; contact?: ContactInput | null;
}): Promise<Ok<{ id: string; linkedLead: string | null }> | Fail> {
  try {
    const name = text(input.name, 160);
    if (!name) throw new Error("Company name is required");
    const website = optUrl(input.website);

    const dup = findDuplicate({ name, website }, await knownCompanies());
    if (dup?.kind === "target") {
      return { ok: false, error: `${dup.name} is already a target.`, duplicate: dup };
    }
    if (dup?.kind === "onboarded") {
      return { ok: false, error: `${dup.name} is already an onboarded customer.`, duplicate: dup };
    }

    const store = targetsStore();
    const target = await store.insertTarget({
      name,
      website,
      priority: input.priority ? oneOf(input.priority, PRIORITIES, "priority") : "B",
      stage: "researching",
      whyTarget: text(input.whyTarget, 2000),
      notes: "",
      source: input.source ? oneOf(input.source, SOURCES, "source") : "other",
      owner: optText(input.owner, 80),
      nextAction: null,
      nextActionDue: null,
      lastTouchAt: null,
      lastTouchSummary: null,
      leadId: dup?.kind === "lead" ? dup.id : null,
    });
    if (input.contact && text(input.contact.name, 120)) {
      await store.insertContact({ targetId: target.id, ...cleanContact(input.contact) });
    }
    refresh(target.id);
    if (dup?.kind === "lead") revalidatePath("/admin/tracker");
    return { ok: true, id: target.id, linkedLead: dup?.kind === "lead" ? dup.name : null };
  } catch (e) {
    return fail(e);
  }
}

/** The Tracker's "→ Target": turns a crawled lead into a hand-worked target, or opens the one it already became. */
export async function promoteLead(leadId: string): Promise<Ok<{ id: string }> | Fail> {
  try {
    const store = targetsStore();
    const existing = (await store.listTargets()).find((t) => t.leadId === leadId);
    if (existing) return { ok: true, id: existing.id };

    const lead = (await listLeads()).find((l) => l.id === leadId);
    if (!lead) throw new Error("That lead no longer exists");

    const dup = findDuplicate({ name: lead.company, website: lead.domain }, await knownCompanies());
    if (dup?.kind === "target") return { ok: true, id: dup.id };
    if (dup?.kind === "onboarded") return { ok: false, error: `${dup.name} is already an onboarded customer.`, duplicate: dup };

    const why = [lead.roleTitle && `Hiring: ${lead.roleTitle}`, lead.location, `found via ${lead.source}`]
      .filter(Boolean)
      .join(" · ");
    const target = await store.insertTarget({
      name: lead.company,
      website: lead.domain,
      priority: "B",
      stage: "researching",
      whyTarget: why,
      notes: "",
      source: "tracker",
      owner: null,
      nextAction: null,
      nextActionDue: null,
      lastTouchAt: null,
      lastTouchSummary: null,
      leadId: lead.id,
    });
    refresh(target.id);
    revalidatePath("/admin/tracker");
    return { ok: true, id: target.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTarget(
  id: string,
  input: {
    name?: unknown; website?: unknown; priority?: unknown; stage?: unknown; source?: unknown;
    owner?: unknown; whyTarget?: unknown; notes?: unknown; nextAction?: unknown; nextActionDue?: unknown;
  },
): Promise<Ok | Fail> {
  try {
    const patch: TargetPatch = {};
    if (input.name !== undefined) {
      const name = text(input.name, 160);
      if (!name) throw new Error("Company name is required");
      patch.name = name;
    }
    if (input.website !== undefined) patch.website = optUrl(input.website);
    if (input.priority !== undefined) patch.priority = oneOf(input.priority, PRIORITIES, "priority");
    if (input.stage !== undefined) patch.stage = oneOf(input.stage, STAGES, "stage");
    if (input.source !== undefined) patch.source = oneOf(input.source, SOURCES, "source");
    if (input.owner !== undefined) patch.owner = optText(input.owner, 80);
    if (input.whyTarget !== undefined) patch.whyTarget = text(input.whyTarget, 2000);
    if (input.notes !== undefined) patch.notes = text(input.notes, 10_000);
    if (input.nextAction !== undefined) patch.nextAction = optText(input.nextAction, 200);
    if (input.nextActionDue !== undefined) patch.nextActionDue = optDay(input.nextActionDue);

    if (patch.name || patch.website) {
      const t = await targetsStore().getTarget(id);
      if (!t) throw new Error("Target not found");
      const others = (await knownCompanies()).filter((k) => !(k.kind === "target" && k.id === id) && !(k.kind === "lead" && k.id === t.leadId));
      const dup = findDuplicate({ name: patch.name ?? t.name, website: patch.website ?? t.website }, others);
      if (dup) return { ok: false, error: `That's the same company as ${dup.name} (${dup.kind}).`, duplicate: dup };
    }

    await targetsStore().updateTarget(id, patch);
    refresh(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTarget(id: string): Promise<Ok | Fail> {
  try {
    await targetsStore().deleteTarget(id);
    refresh();
    revalidatePath("/admin/tracker");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addContact(targetId: string, input: ContactInput): Promise<Ok | Fail> {
  try {
    const store = targetsStore();
    if (!(await store.getTarget(targetId))) throw new Error("Target not found");
    await store.insertContact({ targetId, ...cleanContact(input) });
    refresh(targetId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setDoNotContact(targetId: string, contactId: string, value: boolean): Promise<Ok | Fail> {
  try {
    const contact = (await targetsStore().listContacts(targetId)).find((c) => c.id === contactId);
    if (!contact) throw new Error("Person not found");
    await targetsStore().updateContact(contactId, { doNotContact: !!value });
    refresh(targetId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Logs a touch, then applies the rules in targets-rules.ts: the stage may move
 * forward, and "last touched" updates. The next step is only changed if the
 * form sent one — `nextStep: null` means "leave it as it is", so logging a
 * reply doesn't wipe a follow-up somebody already planned.
 */
export async function logTouch(
  targetId: string,
  input: {
    contactId?: unknown; channel?: unknown; direction?: unknown; outcome?: unknown;
    summary?: unknown; happenedAt?: unknown; by?: unknown;
    nextStep?: { action?: unknown; due?: unknown } | null;
  },
): Promise<Ok | Fail> {
  try {
    const store = targetsStore();
    const target = await store.getTarget(targetId);
    if (!target) throw new Error("Target not found");

    const channel = oneOf(input.channel, CHANNELS, "channel");
    const direction: TouchDirection | null =
      channel === "note" ? null : oneOf<TouchDirection>(input.direction, ["outbound", "inbound"], "direction");
    const outcome: TouchOutcome | null =
      direction === "inbound" ? oneOf(input.outcome ?? "replied", OUTCOMES, "outcome") : null;

    const contactId = text(input.contactId, 64) || null;
    const contact = contactId ? (await store.listContacts(targetId)).find((c) => c.id === contactId) : null;
    if (contactId && !contact) throw new Error("That person isn't on this target");
    if (contact?.doNotContact && direction === "outbound") {
      throw new Error(`${contact.name} asked not to be contacted. Clear the flag first if that's changed.`);
    }

    let happenedAt = new Date().toISOString();
    if (typeof input.happenedAt === "string" && input.happenedAt) {
      const t = Date.parse(input.happenedAt);
      if (Number.isNaN(t)) throw new Error("Invalid time");
      if (t > Date.now() + 5 * 60_000) throw new Error("A touch can't be in the future");
      happenedAt = new Date(t).toISOString();
    }

    const summary = text(input.summary, 4000);
    if (!summary && channel === "note") throw new Error("A note needs some text");

    await store.insertActivity({
      targetId, contactId: contact?.id ?? null, channel, direction, outcome, summary, happenedAt,
      by: optText(input.by, 80),
    });

    const patch: TargetPatch = { ...applyTouch(target, { channel, direction, outcome, happenedAt }) };
    if (patch.lastTouchAt) patch.lastTouchSummary = touchSummary({ channel, direction, outcome }, contact);
    if (input.nextStep) {
      patch.nextAction = optText(input.nextStep.action, 200);
      patch.nextActionDue = optDay(input.nextStep.due);
    }
    if (Object.keys(patch).length) await store.updateTarget(targetId, patch);

    refresh(targetId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * The list's bulk bar: one stage or owner applied to several targets at once.
 * Only these two fields — bulk-editing anything that belongs to a single
 * company (name, website, notes) would be a mistake waiting to happen.
 */
export async function bulkUpdateTargets(
  ids: unknown,
  input: { stage?: unknown; owner?: unknown },
): Promise<Ok<{ updated: number }> | Fail> {
  try {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) throw new Error("Select some targets first");
    const patch: TargetPatch = {};
    if (input.stage !== undefined) patch.stage = oneOf(input.stage, STAGES, "stage");
    if (input.owner !== undefined) patch.owner = optText(input.owner, 80);
    if (!Object.keys(patch).length) throw new Error("Nothing to change");

    const store = targetsStore();
    const known = new Set((await store.listTargets()).map((t) => t.id));
    const valid = ids.filter((id): id is string => typeof id === "string" && known.has(id));
    for (const id of valid) await store.updateTarget(id, patch);
    refresh();
    return { ok: true, updated: valid.length };
  } catch (e) {
    return fail(e);
  }
}

export async function bulkDeleteTargets(ids: unknown): Promise<Ok<{ deleted: number }> | Fail> {
  try {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) throw new Error("Select some targets first");
    const store = targetsStore();
    const known = new Set((await store.listTargets()).map((t) => t.id));
    const valid = ids.filter((id): id is string => typeof id === "string" && known.has(id));
    for (const id of valid) await store.deleteTarget(id);
    refresh();
    revalidatePath("/admin/tracker");
    return { ok: true, deleted: valid.length };
  } catch (e) {
    return fail(e);
  }
}
