import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Generating a task for one of this company's roles.
 *
 * The model, the prompt, and the step that runs a draft to check it all live
 * in candidate/backend (internal/llm, internal/verify) — the same
 * implementation Mindfries' own admins use for the shared library. This is
 * the Company Portal's way in: it forwards the signed-in user's "mf_company"
 * cookie, which that backend verifies for itself, so it never has to trust
 * this app's word for who is asking.
 *
 * CANDIDATE_BACKEND_URL is that backend's address. It is a different service
 * from COMPANY_BACKEND_URL (company/backend, which does billing). Unset,
 * generation is simply unavailable and the role page says so — attaching a
 * task from the library still works.
 */

export function taskGenerationReady(): boolean {
  return !!process.env.CANDIDATE_BACKEND_URL;
}

/** What running a generated task found. Mirrors candidate/backend's verify.Report. */
export interface TaskVerification {
  status: "verified" | "failed" | "not_run";
  /** One sentence saying what happened, or why it couldn't be run. */
  reason: string;
  command?: string;
  checkedAt?: string;
}

export interface GeneratedTask {
  taskBrief: string;
  starterFiles: Record<string, string>;
  /** The files a correct answer changes, as they read once solved. Never shown to a candidate. */
  solutionFiles: Record<string, string>;
  verification: TaskVerification;
}

export interface TaskRequest {
  name: string;
  taskVariant: string;
  techStack: string[];
  durationMin: number;
  notes: string;
  jobDescription: string;
  /** A sample of the company's own code, path → content. */
  codebase: Record<string, string>;
}

export async function generateTask(spec: TaskRequest): Promise<GeneratedTask> {
  const url = process.env.CANDIDATE_BACKEND_URL;
  if (!url) throw new Error("Task generation isn't connected for this portal yet.");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error("Not signed in.");

  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/+$/, "")}/api/v1/company/templates/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${token}` },
      body: JSON.stringify(spec),
      cache: "no-store",
    });
  } catch {
    throw new Error("The task generation service couldn't be reached — try again.");
  }
  const body = (await res.json().catch(() => null)) as (GeneratedTask & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `Task generation failed (${res.status}).`);
  return {
    taskBrief: body.taskBrief,
    starterFiles: body.starterFiles ?? {},
    solutionFiles: body.solutionFiles ?? {},
    verification: body.verification ?? { status: "not_run", reason: "Not run." },
  };
}

/**
 * Reads pasted code as files. Each file starts with a line of the form
 * `--- path/to/file ---`; text before the first such line is taken as one
 * unnamed file, so pasting a single file with no header still works.
 */
export function parseCodeSample(text: string): Record<string, string> {
  const files: Record<string, string> = {};
  let path = "";
  let lines: string[] = [];
  const flush = () => {
    const content = lines.join("\n").trim();
    if (content) files[path || "sample"] = `${content}\n`;
    lines = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const header = line.match(/^-{3,}\s*(\S.*?)\s*-{3,}\s*$/);
    if (header) {
      flush();
      path = header[1];
    } else {
      lines.push(line);
    }
  }
  flush();
  return files;
}
