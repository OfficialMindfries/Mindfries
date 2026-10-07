import { lineChange } from "./line-change";
import type { FileContents } from "./types";

/**
 * What the candidate has changed since the task was handed to them: which
 * files are new, edited or gone, and by how much. The Changes panel lists
 * these, and each opens as a side-by-side diff against the file as given.
 *
 * It compares the workspace with the task's starting files directly, so it
 * shows the whole of the work so far whether or not anything has been
 * committed — unlike `git diff`, which only knows about what git was told.
 * Installed packages and git's own files aren't the candidate's work and are
 * left out. No DOM or React imports.
 */

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted";
  added: number;
  removed: number;
}

/** Tabs that show a diff rather than a file are opened under this prefix. */
export const DIFF_PREFIX = "diff:";
export const isDiffTab = (path: string | null | undefined): path is string => !!path && path.startsWith(DIFF_PREFIX);
/** The file a tab is about: itself, or the file a diff tab compares. */
export const fileOfTab = (path: string | null): string | null => (isDiffTab(path) ? path.slice(DIFF_PREFIX.length) : path);

const isTooling = (path: string) => /(^|\/)(node_modules|\.git|__pycache__)\//.test(path);
const lines = (text: string) => (text === "" ? 0 : text.replace(/\n$/, "").split("\n").length);

export function workspaceChanges(base: FileContents, current: FileContents): FileChange[] {
  const changes: FileChange[] = [];
  for (const [path, content] of Object.entries(current)) {
    if (isTooling(path)) continue;
    const before = base[path];
    if (before === undefined) changes.push({ path, status: "added", added: lines(content), removed: 0 });
    else if (before !== content) changes.push({ path, status: "modified", ...lineChange(before, content) });
  }
  for (const [path, content] of Object.entries(base)) {
    if (!isTooling(path) && current[path] === undefined) changes.push({ path, status: "deleted", added: 0, removed: lines(content) });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}
