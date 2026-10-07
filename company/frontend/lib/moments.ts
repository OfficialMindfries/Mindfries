/**
 * Turning a report's citations into moments a reviewer can look at.
 *
 * The analysis agents cite the trail entries their observations rest on as
 * "[E1234]" — the id of an `activity_events` row (candidate/backend's
 * orchestrator/evidence.go, which also drops any citation of an event that
 * doesn't exist). Here each one becomes: how far into the session it was,
 * and a plain description of what happened then.
 */

export interface Moment {
  /** The activity event's id — what "[E<id>]" in the text refers to. */
  id: number;
  /** Seconds from the start of the session. */
  offsetSeconds: number;
  /** What happened, in a few words. */
  what: string;
}

export const REF = /\[E(\d+)\]/g;

/** Every event id cited anywhere in the given texts. */
export function citedIds(texts: string[]): number[] {
  const ids = new Set<number>();
  for (const text of texts) for (const m of text.matchAll(REF)) ids.add(Number(m[1]));
  return [...ids];
}

const clip = (text: string, max = 110) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** A few words for what an event was. Unknown types fall back to their name. */
export function describeEvent(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "file_edit": {
      const paths = Array.isArray(payload.paths) ? payload.paths.filter((p): p is string => typeof p === "string") : [];
      return paths.length ? `Edited ${paths.join(", ")}` : "Edited a file";
    }
    case "workspace_output": {
      const lines = Array.isArray(payload.lines) ? payload.lines.filter((l): l is string => typeof l === "string") : [];
      return clip(`${str(payload.channel) || "Output"}: ${lines.join(" · ")}`);
    }
    case "ai_usage":
      return clip(`${payload.role === "candidate" ? "Asked the assistant" : "The assistant replied"}: ${str(payload.text)}`);
    case "interview":
      return clip(`${payload.role === "interviewer" ? "Interviewer asked" : "Candidate answered"}: ${str(payload.text)}`);
    case "terminal_command":
      return clip(`Ran ${str(payload.command)}${Number(payload.exitCode) ? ` (exited ${Number(payload.exitCode)})` : ""}`);
    case "test_run":
      return payload.parsed === false
        ? clip(`Ran the tests: ${str(payload.command)} (exited ${Number(payload.exitCode) || 0})`)
        : `Ran the tests: ${Number(payload.passed) || 0} passed, ${Number(payload.failed) || 0} failed`;
    case "file_open":
      return `Opened ${str(payload.path) || "a file"}`;
    case "assistant_copy":
      return `Copied ${Number(payload.chars) || 0} characters out of the assistant panel`;
    case "paste":
      return `Pasted ${Number(payload.chars) || 0} characters into ${str(payload.target) || "the workspace"}`;
    case "tab_hidden":
      return `Returned after ${Number(payload.seconds) || 0} seconds away from the workspace`;
    case "auto_submitted":
      return "The server submitted the session";
    default:
      return type.replace(/_/g, " ");
  }
}

/** "12:34" — minutes and seconds into the session. */
export function clock(offsetSeconds: number): string {
  const s = Math.max(0, Math.round(offsetSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
