"use server";

import { redirect } from "next/navigation";
import {
  askAssistant,
  backendReady,
  BackendAuthError,
  getAssistantHistory,
  submitSession,
  type AssistantHistory,
} from "@/lib/backend/client";
import { isRedirectError } from "@/lib/isRedirectError";

/**
 * The workspace's Submit button, wired for real: ends the session on the
 * backend (candidate/backend's Assessment Orchestrator marks it submitted
 * and kicks off evaluation) and sends the candidate to the report page to
 * watch it land. Previously this only flipped local UI state to a
 * "Work submitted" screen — nothing was ever actually submitted anywhere.
 *
 * sessionId is the id IdeShell was opened with (?session=<id> from
 * onboarding's enterWorkspace) — a workspace opened without one (backend
 * unconfigured when it was entered, or opened directly at /ide) has nothing
 * real to submit, and the caller should keep the local-only confirmation
 * screen rather than call this at all.
 */
export async function submitAssessment(
  sessionId: string,
  files?: Record<string, string>,
): Promise<{ error: string } | never> {
  try {
    await submitSession(sessionId, files);
  } catch (err) {
    if (err instanceof BackendAuthError) redirect(`/login?next=/ide`);
    if (isRedirectError(err)) throw err;
    return { error: err instanceof Error ? err.message : "Could not submit. Please try again." };
  }
  redirect(`/assessments/${encodeURIComponent(sessionId)}/report`);
}

const AI_OFFLINE = "The assessment service isn't connected, so the AI can't be reached right now.";

function aiFailure(err: unknown): { error: string } {
  if (err instanceof BackendAuthError) return { error: "Your sign-in has expired — sign in again to continue." };
  return { error: err instanceof Error ? err.message : "The AI service didn't answer — try again." };
}

/** The assistant conversation so far, so a reloaded workspace shows what was already said. */
export async function loadAssistant(sessionId: string): Promise<AssistantHistory | { error: string }> {
  if (!backendReady()) return { messages: [], configured: false };
  try {
    return await getAssistantHistory(sessionId);
  } catch (err) {
    return aiFailure(err);
  }
}

/**
 * One question to the workspace assistant. The open file travels with it so
 * the answer can be about the code actually on screen; the backend records
 * both sides of the exchange as evidence.
 */
export async function askWorkspaceAssistant(
  sessionId: string,
  message: string,
  filePath?: string,
  fileContent?: string,
): Promise<{ reply: string } | { error: string }> {
  if (!backendReady()) return { error: AI_OFFLINE };
  try {
    return await askAssistant(sessionId, message, filePath, fileContent);
  } catch (err) {
    return aiFailure(err);
  }
}
