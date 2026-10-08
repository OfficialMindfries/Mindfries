"use server";

import { db } from "@/lib/supabase";
import { currentCandidate } from "@/lib/auth/users";
import { revalidatePath } from "next/cache";
import { MAX_RESUME_TEXT, parseResumeText, type ResumeFields } from "./resume-fields";
import { AccountNotFound, dropKnowledge, isKnowledgeSource, readAccount, storeKnowledge } from "./knowledge";
import { statsOf } from "./knowledge-shape";
import { readThroughConnection } from "./knowledge-connection";
import { endConnection } from "../composio";
import { PLATFORMS, type LinkPlatform } from "./links";
import { NOTICE_PERIODS, OPEN_TO_OPTIONS } from "./data";

// The edit form limits what can be typed, but a server action is a public
// endpoint: these are the limits that actually hold. The bio's matches the
// form's counter; the others are generous for a real headline or city.
const MAX_NAME = 200;
const MAX_HEADLINE = 120;
const MAX_LOCATION = 120;
const MAX_BIO = 500;
const line = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

const isPlatform = (p: string): p is LinkPlatform => Object.hasOwn(PLATFORMS, p);

/** A linked account's knowledge base can be re-read this often, per account. */
const REFRESH_EVERY_MS = 10 * 60_000;

export async function getProfile() {
  const session = await currentCandidate();
  if (!session) return null;

  const c = db();
  if (!c) return null;

  const { data } = await c
    .from("candidate_users")
    .select("name, role, location, bio, notice_period, open_to, resume_path, resume_parsed, resume_parsed_at, links, profile_updated_at, email_verified_at")
    .eq("id", session.id)
    .single();
  if (!data) return data;

  // What this returns is handed to client components, so it carries only
  // *that* an account is connected. The connection's id never leaves the
  // server; code that needs it reads the row itself.
  const links = Object.fromEntries(
    Object.entries((data.links ?? {}) as Record<string, Record<string, unknown> | null>).map(([platform, link]) => [
      platform,
      link?.connectionId ? { ...link, connectionId: "connected" } : link,
    ]),
  );
  return { ...data, links };
}

export async function getResumeUrl(path: string | null) {
  if (!path) return null;
  const c = db();
  if (!c) return null;

  const { data } = await c.storage.from("resumes").createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

export async function saveIdentity(form: { name: string; role: string; location: string; openTo: string[]; noticePeriod: string; bio: string }) {
  const session = await currentCandidate();
  if (!session) return { error: "Not signed in" };

  const c = db();
  if (!c) return { error: "Database not connected" };

  const name = line(form?.name, MAX_NAME);
  const role = line(form?.role, MAX_HEADLINE);
  if (!name || !role) return { error: "Name and role can't be empty." };
  const bio = typeof form?.bio === "string" ? form.bio.trim().slice(0, MAX_BIO) : "";
  // Only the choices the form offers; anything else is dropped.
  const openTo = (Array.isArray(form?.openTo) ? form.openTo : []).filter((o) => OPEN_TO_OPTIONS.includes(o));
  const noticePeriod = NOTICE_PERIODS.includes(form?.noticePeriod) ? form.noticePeriod : "";

  const { error } = await c
    .from("candidate_users")
    .update({
      name,
      role,
      location: line(form?.location, MAX_LOCATION),
      open_to: openTo,
      notice_period: noticePeriod,
      bio,
      profile_updated_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Links an account. The value is normalised here as well as on the page — a
 * server action is a public endpoint — and a GitHub or GitLab username is
 * read from the platform before it is saved: an account that doesn't exist
 * is refused, and one that does has its public projects, languages and
 * activity kept (lib/profile/knowledge.ts). If the platform simply doesn't
 * answer, the link is still saved, without that.
 */
export async function saveLink(platform: string, rawValue: string) {
  const session = await currentCandidate();
  if (!session) return { error: "Not signed in" };
  if (!isPlatform(platform)) return { error: "Unknown platform." };

  const normalised = PLATFORMS[platform].normalize(String(rawValue).slice(0, 500));
  if (!normalised.ok) return { error: normalised.error };
  const value = normalised.value;

  const c = db();
  if (!c) return { error: "Database not connected" };

  const { data } = await c.from("candidate_users").select("links").eq("id", session.id).single();
  const currentLinks = data?.links || {};
  // A sign-in showed one particular account is theirs. Typing a username
  // keeps that only if it is the same account; a LinkedIn sign-in confirms
  // a name rather than an address, so it stands whatever address is typed.
  const was = currentLinks[platform]?.verified as { at: string; as: string } | undefined;
  const verified = was && (platform === "linkedin" || was.as.toLowerCase() === value.toLowerCase()) ? was : undefined;
  // The connection is to the account that was signed in to. If the link now
  // names a different account, the connection has nothing to do with it and
  // is ended rather than left behind.
  const connectionId = currentLinks[platform]?.connectionId as string | undefined;
  if (connectionId && !verified) await endConnection(connectionId);
  const kept = verified && connectionId ? { connectionId, ...(currentLinks[platform]?.profile ? { profile: currentLinks[platform].profile } : {}) } : {};

  let stats: ReturnType<typeof statsOf> | undefined;
  if (isKnowledgeSource(platform)) {
    try {
      const knowledge = verified && connectionId ? await readThroughConnection(platform, session.id, connectionId, value) : await readAccount(platform, value);
      await storeKnowledge(session.id, knowledge, !!verified);
      stats = statsOf(knowledge);
    } catch (e) {
      if (e instanceof AccountNotFound) return { error: e.message };
      // The platform didn't answer. A real username shouldn't be refused
      // for that; whatever an earlier link left behind no longer applies.
      await dropKnowledge(session.id, platform);
    }
  }

  const { error } = await c
    .from("candidate_users")
    .update({
      links: { ...currentLinks, [platform]: { value, savedAt: new Date().toISOString(), ...(stats ? { stats } : {}), ...(verified ? { verified } : {}), ...kept } },
    })
    .eq("id", session.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { ok: true };
}

/** Reads a linked GitHub or GitLab account again, so the knowledge base reflects it as it is now. */
export async function refreshKnowledge(platform: string) {
  const session = await currentCandidate();
  if (!session) return { error: "Not signed in" };
  if (!isKnowledgeSource(platform)) return { error: "Only GitHub and GitLab can be refreshed." };

  const c = db();
  if (!c) return { error: "Database not connected" };

  const { data } = await c.from("candidate_users").select("links").eq("id", session.id).single();
  const links = data?.links || {};
  const value = links[platform]?.value;
  if (typeof value !== "string" || !value) return { error: "That account isn't linked." };

  const { data: existing } = await c
    .from("candidate_knowledge")
    .select("fetched_at")
    .eq("candidate_id", session.id)
    .eq("source", platform)
    .maybeSingle();
  const age = existing?.fetched_at ? Date.now() - Date.parse(existing.fetched_at as string) : Infinity;
  if (age < REFRESH_EVERY_MS) {
    return { error: `That was read ${Math.max(1, Math.round(age / 60_000))} minutes ago — try again a little later.` };
  }

  try {
    // A refresh re-reads the same account, so it stays verified if it was —
    // and a connected account is re-read through its connection.
    const verifiedAs = links[platform]?.verified?.as;
    const stillVerified = typeof verifiedAs === "string" && verifiedAs.toLowerCase() === value.toLowerCase();
    const connectionId = links[platform]?.connectionId;
    const knowledge = stillVerified && typeof connectionId === "string" ? await readThroughConnection(platform, session.id, connectionId, value) : await readAccount(platform, value);
    await storeKnowledge(session.id, knowledge, stillVerified);
    await c
      .from("candidate_users")
      .update({ links: { ...links, [platform]: { ...links[platform], stats: statsOf(knowledge) } } })
      .eq("id", session.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read that account." };
  }

  revalidatePath("/profile");
  return { ok: true };
}

export async function removeLink(platform: string) {
  const session = await currentCandidate();
  if (!session) return { error: "Not signed in" };

  const c = db();
  if (!c) return { error: "Database not connected" };

  const { data } = await c.from("candidate_users").select("links").eq("id", session.id).single();
  const currentLinks = data?.links || {};
  // Removing a connected account ends the connection too: the access the
  // candidate gave goes when the account does.
  const connectionId = currentLinks[platform]?.connectionId;
  if (typeof connectionId === "string" && connectionId) await endConnection(connectionId);
  delete currentLinks[platform];

  const { error } = await c
    .from("candidate_users")
    .update({ links: currentLinks })
    .eq("id", session.id);

  if (error) return { error: error.message };
  if (isKnowledgeSource(platform)) await dropKnowledge(session.id, platform);

  revalidatePath("/profile");
  return { ok: true };
}

export async function uploadResume(formData: FormData) {
  const session = await currentCandidate();
  if (!session) return { error: "Not signed in" };

  const file = formData.get("file") as File;
  if (!file) return { error: "No file provided" };

  const c = db();
  if (!c) return { error: "Database not connected" };

  // Remove old resume if it exists
  const { data: userData } = await c.from("candidate_users").select("resume_path").eq("id", session.id).single();
  if (userData?.resume_path) {
    await c.storage.from("resumes").remove([userData.resume_path]);
  }

  const path = `${session.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  
  const { error: uploadError } = await c.storage
    .from("resumes")
    .upload(path, file, { contentType: file.type });
    
  if (uploadError) return { error: uploadError.message };

  // The page extracts the text (lib/profile/resumeParse.ts) and sends it
  // with the file; the fields are read out of it here, so what is stored is
  // this code's reading of the text and not something the page asserted. No
  // text — a .doc, a scanned PDF, an extraction that failed — clears what an
  // earlier resume left behind rather than leaving it to describe this one.
  const textRaw = formData.get("text");
  const text = typeof textRaw === "string" ? textRaw.replace(/\u0000/g, "").slice(0, MAX_RESUME_TEXT).trim() : "";
  const parsed: ResumeFields | null = text ? parseResumeText(text) : null;

  const { error: dbError } = await c
    .from("candidate_users")
    .update({
      resume_path: path,
      resume_text: text || null,
      resume_parsed: parsed,
      resume_parsed_at: parsed ? new Date().toISOString() : null,
    })
    .eq("id", session.id);

  if (dbError) return { error: dbError.message };

  revalidatePath("/profile");
  return { ok: true, path, parsed };
}

/**
 * Copies what was read from the resume into the profile — only into fields
 * the candidate has left empty, and only when they ask. Nothing they wrote
 * is replaced.
 */
export async function fillProfileFromResume() {
  const session = await currentCandidate();
  if (!session) return { error: "Not signed in" };

  const c = db();
  if (!c) return { error: "Database not connected" };

  const { data } = await c
    .from("candidate_users")
    .select("role, location, bio, links, resume_parsed")
    .eq("id", session.id)
    .single();
  const parsed = (data?.resume_parsed ?? null) as ResumeFields | null;
  if (!parsed) return { error: "Nothing has been read from a resume yet." };

  const update: Record<string, unknown> = {};
  const filled: string[] = [];
  if (!data?.role && parsed.role) { update.role = parsed.role; filled.push("headline"); }
  if (!data?.location && parsed.location) { update.location = parsed.location; filled.push("location"); }
  if (!data?.bio && parsed.bio) { update.bio = parsed.bio; filled.push("about you"); }
  if (filled.length === 0) return { ok: true, filled };

  const { error } = await c
    .from("candidate_users")
    .update({ ...update, profile_updated_at: new Date().toISOString() })
    .eq("id", session.id);
  if (error) return { error: error.message };

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true, filled };
}

export async function removeResume() {
  const session = await currentCandidate();
  if (!session) return { error: "Not signed in" };

  const c = db();
  if (!c) return { error: "Database not connected" };

  const { data: userData } = await c.from("candidate_users").select("resume_path").eq("id", session.id).single();
  if (userData?.resume_path) {
    await c.storage.from("resumes").remove([userData.resume_path]);
  }

  const { error } = await c
    .from("candidate_users")
    .update({ resume_path: null, resume_text: null, resume_parsed: null, resume_parsed_at: null })
    .eq("id", session.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  return { ok: true };
}
