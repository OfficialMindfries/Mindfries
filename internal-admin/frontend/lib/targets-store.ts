import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "./supabase";
import { companyKey } from "./targets-rules";
import type { TargetActivity, TargetCompany, TargetContact } from "./types";

// Storage for the Targets panel.
//
// Two backends behind one interface:
//
// - **Supabase** (0003_targets.sql) once SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   are set. This is the real one: several founders share one list.
// - **A JSON file on this machine** until then. Every other admin page renders
//   empty without Supabase, which is fine for read-only views but would make a
//   panel you're meant to type into useless on day one. The file is honest
//   about what it is — the page says "saved on this machine only" — and it
//   won't survive a serverless deploy, whose filesystem is read-only.
//
// Only primitive reads and writes live here. Every rule (stage changes,
// duplicates, do-not-contact) is in targets-rules.ts and the server actions,
// so both backends behave identically by construction.

export type NewTarget = Omit<TargetCompany, "id" | "createdAt" | "updatedAt">;
export type TargetPatch = Partial<Omit<TargetCompany, "id" | "createdAt" | "updatedAt">>;
export type NewContact = Omit<TargetContact, "id" | "createdAt">;
export type ContactPatch = Partial<Omit<TargetContact, "id" | "targetId" | "createdAt">>;
export type NewActivity = Omit<TargetActivity, "id" | "createdAt">;

export interface TargetsStore {
  mode: "supabase" | "file";
  listTargets(): Promise<TargetCompany[]>;
  getTarget(id: string): Promise<TargetCompany | null>;
  insertTarget(t: NewTarget): Promise<TargetCompany>;
  updateTarget(id: string, patch: TargetPatch): Promise<void>;
  deleteTarget(id: string): Promise<void>;
  /** All contacts, or one target's. */
  listContacts(targetId?: string): Promise<TargetContact[]>;
  insertContact(c: NewContact): Promise<TargetContact>;
  updateContact(id: string, patch: ContactPatch): Promise<void>;
  /** One target's activity, newest first. */
  listActivities(targetId: string): Promise<TargetActivity[]>;
  insertActivity(a: NewActivity): Promise<TargetActivity>;
}

export function targetsStore(): TargetsStore {
  const client = db();
  return client ? supabaseStore(client) : fileStore;
}

/**
 * Supabase is configured, but 0003_targets.sql has never been applied to that
 * project — so the tables genuinely aren't there.
 *
 * This deliberately does NOT fall back to the file store. Falling back would
 * look like the panel working while every write went to a JSON file on one
 * machine, invisible to everyone else. Better to say what's missing.
 */
export class MissingTablesError extends Error {
  constructor(readonly table: string) {
    super(
      `The Targets tables aren't in this Supabase project yet (public.${table} is missing). ` +
        `Apply supabase/migrations/0003_targets.sql to the project, then reload.`,
    );
    this.name = "MissingTablesError";
  }
}

export const isMissingTables = (e: unknown): e is MissingTablesError => e instanceof MissingTablesError;

/** PostgREST's code for "no such table in the schema cache". */
const NO_SUCH_TABLE = "PGRST205";

// ── Supabase ────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = NonNullable<ReturnType<typeof db>>;

const TARGET_COLS: Record<keyof TargetPatch, string> = {
  name: "name", website: "website", priority: "priority", stage: "stage", whyTarget: "why_target",
  notes: "notes", source: "source", owner: "owner", nextAction: "next_action",
  nextActionDue: "next_action_due", lastTouchAt: "last_touch_at", lastTouchSummary: "last_touch_summary",
  leadId: "lead_id",
};
const CONTACT_COLS: Record<keyof ContactPatch, string> = {
  name: "name", role: "role", email: "email", linkedinUrl: "linkedin_url", persona: "persona",
  warmth: "warmth", doNotContact: "do_not_contact", notes: "notes",
};

function toRow(patch: Record<string, unknown>, cols: Record<string, string>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && cols[k]) row[cols[k]] = v;
  return row;
}

const fromTarget = (r: any): TargetCompany => ({
  id: r.id, name: r.name, website: r.website ?? null, priority: r.priority, stage: r.stage,
  whyTarget: r.why_target ?? "", notes: r.notes ?? "", source: r.source, owner: r.owner ?? null,
  nextAction: r.next_action ?? null, nextActionDue: r.next_action_due ?? null,
  lastTouchAt: r.last_touch_at ?? null, lastTouchSummary: r.last_touch_summary ?? null,
  leadId: r.lead_id ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
});
const fromContact = (r: any): TargetContact => ({
  id: r.id, targetId: r.target_id, name: r.name, role: r.role ?? null, email: r.email ?? null,
  linkedinUrl: r.linkedin_url ?? null, persona: r.persona, warmth: r.warmth,
  doNotContact: !!r.do_not_contact, notes: r.notes ?? null, createdAt: r.created_at,
});
const fromActivity = (r: any): TargetActivity => ({
  id: r.id, targetId: r.target_id, contactId: r.contact_id ?? null, channel: r.channel,
  direction: r.direction ?? null, outcome: r.outcome ?? null, summary: r.summary ?? "",
  happenedAt: r.happened_at, by: r.by_name ?? null, createdAt: r.created_at,
});

function supabaseStore(c: Client): TargetsStore {
  // `table` is passed in rather than parsed out of the message, so a missing
  // table is reported as itself even if PostgREST rewords the text.
  const must = <T>(table: string, { data, error }: { data: T; error: unknown }): T => {
    if (error) {
      if ((error as any)?.code === NO_SUCH_TABLE) throw new MissingTablesError(table);
      throw error instanceof Error ? error : new Error(String((error as any)?.message ?? error));
    }
    return data;
  };
  return {
    mode: "supabase",
    async listTargets() {
      return (must("target_companies", await c.from("target_companies").select("*")) ?? []).map(fromTarget);
    },
    async getTarget(id) {
      const data = must("target_companies", await c.from("target_companies").select("*").eq("id", id).maybeSingle());
      return data ? fromTarget(data) : null;
    },
    async insertTarget(t) {
      const row = { ...toRow(t, TARGET_COLS), company_key: companyKey(t.name) };
      return fromTarget(must("target_companies", await c.from("target_companies").insert(row).select("*").single()));
    },
    async updateTarget(id, patch) {
      const row: Record<string, unknown> = { ...toRow(patch, TARGET_COLS), updated_at: new Date().toISOString() };
      if (patch.name !== undefined) row.company_key = companyKey(patch.name);
      must("target_companies", await c.from("target_companies").update(row).eq("id", id));
    },
    async deleteTarget(id) {
      must("target_companies", await c.from("target_companies").delete().eq("id", id));
    },
    async listContacts(targetId) {
      let q = c.from("target_contacts").select("*").order("created_at", { ascending: true });
      if (targetId) q = q.eq("target_id", targetId);
      return (must("target_contacts", await q) ?? []).map(fromContact);
    },
    async insertContact(ct) {
      const row = { ...toRow(ct, CONTACT_COLS), target_id: ct.targetId };
      return fromContact(must("target_contacts", await c.from("target_contacts").insert(row).select("*").single()));
    },
    async updateContact(id, patch) {
      must("target_contacts", await c.from("target_contacts").update(toRow(patch, CONTACT_COLS)).eq("id", id));
    },
    async listActivities(targetId) {
      const q = c.from("target_activities").select("*").eq("target_id", targetId).order("happened_at", { ascending: false });
      return (must("target_activities", await q) ?? []).map(fromActivity);
    },
    async insertActivity(a) {
      const row = {
        target_id: a.targetId, contact_id: a.contactId, channel: a.channel, direction: a.direction,
        outcome: a.outcome, summary: a.summary, happened_at: a.happenedAt, by_name: a.by,
      };
      return fromActivity(must("target_activities", await c.from("target_activities").insert(row).select("*").single()));
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Local file ──────────────────────────────────────────────────────────────

interface FileData {
  targets: TargetCompany[];
  contacts: TargetContact[];
  activities: TargetActivity[];
}

// Next runs the dev server from the app directory, so this lands in
// internal-admin/frontend/.data/ — gitignored, next to the app it belongs to.
const FILE = path.join(process.cwd(), ".data", "targets.json");

async function load(): Promise<FileData> {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as Partial<FileData>;
    return { targets: parsed.targets ?? [], contacts: parsed.contacts ?? [], activities: parsed.activities ?? [] };
  } catch (err) {
    // Missing is normal on first use; anything else (corrupt JSON) must not
    // be mistaken for "empty" and then overwritten with nothing.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { targets: [], contacts: [], activities: [] };
    throw new Error(`Couldn't read ${FILE}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Writes are read-modify-write on one file, so two at once would lose one of
// them. Chaining every mutation onto a single promise serialises them within
// this server process; the write itself goes to a temp file and is renamed
// into place, so a crash mid-write can't leave half a file behind.
let queue: Promise<unknown> = Promise.resolve();
function mutate<T>(fn: (d: FileData) => T): Promise<T> {
  const run = queue.then(async () => {
    const data = await load();
    const result = fn(data);
    await mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, FILE);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

const nowIso = () => new Date().toISOString();

const fileStore: TargetsStore = {
  mode: "file",
  async listTargets() {
    return (await load()).targets;
  },
  async getTarget(id) {
    return (await load()).targets.find((t) => t.id === id) ?? null;
  },
  insertTarget(t) {
    return mutate((d) => {
      const row: TargetCompany = { ...t, id: randomUUID(), createdAt: nowIso(), updatedAt: nowIso() };
      d.targets.push(row);
      return row;
    });
  },
  async updateTarget(id, patch) {
    await mutate((d) => {
      const t = d.targets.find((x) => x.id === id);
      if (!t) throw new Error("Target not found");
      Object.assign(t, stripUndefined(patch), { updatedAt: nowIso() });
    });
  },
  async deleteTarget(id) {
    await mutate((d) => {
      d.targets = d.targets.filter((t) => t.id !== id);
      d.contacts = d.contacts.filter((c) => c.targetId !== id);
      d.activities = d.activities.filter((a) => a.targetId !== id);
    });
  },
  async listContacts(targetId) {
    const all = (await load()).contacts;
    return targetId ? all.filter((c) => c.targetId === targetId) : all;
  },
  insertContact(ct) {
    return mutate((d) => {
      const row: TargetContact = { ...ct, id: randomUUID(), createdAt: nowIso() };
      d.contacts.push(row);
      return row;
    });
  },
  async updateContact(id, patch) {
    await mutate((d) => {
      const c = d.contacts.find((x) => x.id === id);
      if (!c) throw new Error("Contact not found");
      Object.assign(c, stripUndefined(patch));
    });
  },
  async listActivities(targetId) {
    return (await load()).activities
      .filter((a) => a.targetId === targetId)
      .sort((a, b) => b.happenedAt.localeCompare(a.happenedAt));
  },
  insertActivity(a) {
    return mutate((d) => {
      const row: TargetActivity = { ...a, id: randomUUID(), createdAt: nowIso() };
      d.activities.push(row);
      return row;
    });
  },
};

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
