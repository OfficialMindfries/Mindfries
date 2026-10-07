import type { FileContents } from "./types";

/**
 * The workspace's files, trimmed to what's worth sending as evidence — what
 * the interviewer and the Code Evaluation agent read (see candidate/backend's
 * orchestrator.RecordSnapshot, which applies its own, authoritative limits).
 *
 * Installed packages and git internals are the candidate's tooling, not
 * their work, and would crowd out the files that are. The byte budget keeps
 * the request under the server action body limit; smaller files go first so
 * one large file can't push out everything else.
 */
const MAX_TOTAL_BYTES = 600 * 1024;
const MAX_FILE_BYTES = 60 * 1024;

const isTooling = (path: string) => /(^|\/)(node_modules|\.git|__pycache__)\//.test(path);

export function snapshotFiles(files: FileContents): Record<string, string> {
  const candidates = Object.entries(files)
    .filter(([path, content]) => !isTooling(path) && content.length <= MAX_FILE_BYTES)
    .sort((a, b) => a[1].length - b[1].length);

  const out: Record<string, string> = {};
  let total = 0;
  for (const [path, content] of candidates) {
    if (total + content.length > MAX_TOTAL_BYTES) break;
    out[path] = content;
    total += content.length;
  }
  return out;
}
