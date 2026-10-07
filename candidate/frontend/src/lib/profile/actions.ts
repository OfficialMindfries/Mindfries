"use server";

import { db } from "@/lib/supabase";
import { currentCandidate } from "@/lib/auth/users";
import { revalidatePath } from "next/cache";
import { MAX_RESUME_TEXT, parseResumeText, type ResumeFields } from "./resume-fields";

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

  return data;
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

  const { error } = await c
    .from("candidate_users")
    .update({
      name: form.name,
      role: form.role,
      location: form.location,
      open_to: form.openTo,
      notice_period: form.noticePeriod,
      bio: form.bio,
      profile_updated_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function saveLink(platform: string, value: string) {
  const session = await currentCandidate();
  if (!session) return { error: "Not signed in" };

  const c = db();
  if (!c) return { error: "Database not connected" };

  const { data } = await c.from("candidate_users").select("links").eq("id", session.id).single();
  const currentLinks = data?.links || {};

  const { error } = await c
    .from("candidate_users")
    .update({
      links: { ...currentLinks, [platform]: { value, savedAt: new Date().toISOString() } },
    })
    .eq("id", session.id);

  if (error) return { error: error.message };

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
  delete currentLinks[platform];

  const { error } = await c
    .from("candidate_users")
    .update({ links: currentLinks })
    .eq("id", session.id);

  if (error) return { error: error.message };

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
