import type { VfsBridge } from "../vfs-bridge";
import type { TreeNode } from "../types";
import { findNode } from "../tree";
import { resolveInputPath, segmentsToPath } from "../vfs-path";
import type { ShellSession } from "./types";

/** Resolves user input (relative, absolute, `.`/`..`) against the session's cwd. */
export function resolve(session: ShellSession, input: string | undefined): string[] {
  return resolveInputPath(session.cwd, input ?? "");
}

/**
 * The node at a path, or `"root"` for the workspace root — which is a real
 * directory but has no TreeNode of its own (the tree IS its children).
 */
export function nodeAt(vfs: VfsBridge, segments: string[]): TreeNode | "root" | undefined {
  if (segments.length === 0) return "root";
  return findNode(vfs.getSnapshot().tree, segmentsToPath(segments));
}

/** Directory entries at a path, or null if it isn't a directory. */
export function childrenAt(vfs: VfsBridge, segments: string[]): TreeNode[] | null {
  const node = nodeAt(vfs, segments);
  if (node === "root") return vfs.getSnapshot().tree;
  if (!node || node.type !== "folder") return null;
  return node.children;
}

/**
 * Plain alphabetical, the way real `ls`, `tree` and glob expansion order
 * things — directories are NOT hoisted to the top (that's
 * `--group-directories-first`, which isn't the default anywhere).
 */
export function sortEntries(nodes: TreeNode[]): TreeNode[] {
  return [...nodes].sort((a, b) => a.name.localeCompare(b.name));
}

/** File contents, or null when the path is missing or is a directory. */
export function readFile(vfs: VfsBridge, segments: string[]): string | null {
  const node = nodeAt(vfs, segments);
  if (!node || node === "root" || node.type !== "file") return null;
  return vfs.getSnapshot().files[node.path] ?? "";
}

/** Every file path under a directory (or the file itself), depth-first. */
export function walk(vfs: VfsBridge, segments: string[]): TreeNode[] {
  const node = nodeAt(vfs, segments);
  if (!node) return [];
  if (node === "root") return flatten(vfs.getSnapshot().tree);
  return node.type === "folder" ? [node, ...flatten(node.children)] : [node];
}

function flatten(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => (n.type === "folder" ? [n, ...flatten(n.children)] : [n]));
}

/** Shell glob (`*`, `?`) as a regex — `*` deliberately does not cross "/". */
function globToRegExp(pattern: string): RegExp {
  const source = pattern
    .split("")
    .map((ch) => {
      if (ch === "*") return "[^/]*";
      if (ch === "?") return "[^/]";
      return ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${source}$`);
}

export function matchesGlob(name: string, pattern: string): boolean {
  return globToRegExp(pattern).test(name);
}

/**
 * Expands one glob pattern against the filesystem. An unmatched pattern is
 * returned unchanged — that's what bash does by default (`nullglob` off),
 * and it's why `grep "*" file` still works when nothing matches.
 */
export function expandGlob(vfs: VfsBridge, session: ShellSession, pattern: string): string[] {
  const slash = pattern.lastIndexOf("/");
  const dirPart = slash === -1 ? "" : pattern.slice(0, slash + 1);
  const namePart = slash === -1 ? pattern : pattern.slice(slash + 1);
  if (!/[*?]/.test(namePart)) return [pattern];

  const entries = childrenAt(vfs, resolve(session, dirPart));
  if (!entries) return [pattern];

  const matches = sortEntries(entries)
    .map((n) => n.name)
    // A leading dot must be matched explicitly, same as a real shell.
    .filter((name) => (name.startsWith(".") ? namePart.startsWith(".") : true))
    .filter((name) => matchesGlob(name, namePart))
    .map((name) => `${dirPart}${name}`);

  return matches.length > 0 ? matches : [pattern];
}
