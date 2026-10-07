"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./supabase";
import { currentCandidate } from "./auth/users";

/** What the environment check page reports once it has run. */
export interface EnvironmentReport {
  camera: boolean;
  microphone: boolean;
  /** Every capability the workspace needs is present. */
  browser: boolean;
  /** The capabilities that were missing, by name. */
  missing: string[];
  userAgent: string;
}

/**
 * Records an environment check. What is stored is what the candidate's
 * browser said about itself — the server has no way to look through their
 * camera — so it is kept as their browser's report and used for one thing:
 * ticking the step off on their own dashboard. It is marked as passed only
 * when all three parts passed.
 */
export async function saveEnvironmentCheck(report: EnvironmentReport): Promise<{ ok: boolean; passed: boolean }> {
  const candidate = await currentCandidate();
  const c = db();
  if (!candidate || !c) return { ok: false, passed: false };

  const clean = {
    camera: report?.camera === true,
    microphone: report?.microphone === true,
    browser: report?.browser === true,
    missing: (Array.isArray(report?.missing) ? report.missing : []).filter((m) => typeof m === "string").slice(0, 20).map((m) => m.slice(0, 60)),
    userAgent: String(report?.userAgent ?? "").slice(0, 300),
    at: new Date().toISOString(),
  };
  const passed = clean.camera && clean.microphone && clean.browser;

  const { error } = await c
    .from("candidate_users")
    .update({ environment_check: clean, ...(passed ? { environment_checked_at: clean.at } : {}) })
    .eq("id", candidate.id);
  if (error) return { ok: false, passed };

  revalidatePath("/dashboard");
  return { ok: true, passed };
}

/**
 * Opens a practice run. One row notes that it happened, so the dashboard
 * can count it — and that is everything kept about it: the practice
 * workspace has no session, so nothing typed, run or shown in it is
 * recorded anywhere.
 */
export async function startPracticeRun(): Promise<void> {
  const candidate = await currentCandidate();
  const c = db();
  if (candidate && c) {
    await c.from("practice_runs").insert({ candidate_id: candidate.id });
    revalidatePath("/dashboard");
  }
  redirect("/ide?practice=1");
}
