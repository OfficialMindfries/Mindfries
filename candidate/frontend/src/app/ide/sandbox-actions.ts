"use server";

import {
  BackendAuthError,
  sandboxChange,
  sandboxFiles,
  sandboxRead,
  sandboxRun,
  sandboxTerminal,
  sandboxWrite,
  type SandboxEntry,
  type SandboxFile,
} from "@/lib/backend/client";

// The IDE's calls to its session's sandbox (candidate/backend's
// internal/httpapi/sandbox.go). Each forwards the candidate's own cookie, so
// the backend decides whose sandbox it is; the session id in the arguments
// only says which of their sessions.
//
// Every one returns its failure as a value. A sandbox that is briefly
// unreachable is an ordinary thing for the workspace to handle — it shows
// the candidate what happened and tries again — not an exception to unwind.

type Failed = { ok: false; error: string };

function failed(err: unknown): Failed {
  if (err instanceof BackendAuthError) return { ok: false, error: "Your sign-in has expired — sign in again to continue." };
  return { ok: false, error: err instanceof Error ? err.message : "The sandbox didn't answer — try again in a moment." };
}

export async function listSandboxFiles(sessionId: string): Promise<{ ok: true; entries: SandboxEntry[]; truncated: boolean } | Failed> {
  try {
    return { ok: true, ...(await sandboxFiles(sessionId)) };
  } catch (err) {
    return failed(err);
  }
}

export async function readSandboxFiles(sessionId: string, paths: string[]): Promise<{ ok: true; files: SandboxFile[] } | Failed> {
  try {
    return { ok: true, ...(await sandboxRead(sessionId, paths)) };
  } catch (err) {
    return failed(err);
  }
}

export async function writeSandboxFile(sessionId: string, path: string, content: string): Promise<{ ok: true } | Failed> {
  try {
    await sandboxWrite(sessionId, path, content);
    return { ok: true };
  } catch (err) {
    return failed(err);
  }
}

export async function deleteSandboxPath(sessionId: string, path: string): Promise<{ ok: true } | Failed> {
  try {
    await sandboxChange(sessionId, { op: "delete", path });
    return { ok: true };
  } catch (err) {
    return failed(err);
  }
}

export async function runInSandbox(sessionId: string, command: string): Promise<{ ok: true; exitCode: number; output: string; ms: number } | Failed> {
  try {
    const result = await sandboxRun(sessionId, command);
    return { ok: true, exitCode: result.exitCode, output: result.output, ms: result.ms };
  } catch (err) {
    return failed(err);
  }
}

/** Where the page opens the terminal, and the one-minute ticket that lets it. */
export async function openSandboxTerminal(sessionId: string): Promise<{ ok: true; url: string; ticket: string } | Failed> {
  try {
    return { ok: true, ...(await sandboxTerminal(sessionId)) };
  } catch (err) {
    return failed(err);
  }
}
