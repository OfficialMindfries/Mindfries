import type { FileContents, TreeNode } from "./types";

/**
 * Persists the workspace's virtual filesystem to this browser's
 * localStorage, so it survives a refresh. Still not a real filesystem or
 * a server anywhere — it's scoped to this browser, this origin, and (per
 * localStorage) doesn't sync across devices or tabs' private/incognito
 * windows. Kept separate from mutation logic so IdeShell just calls
 * `load()` once on mount and `save(...)` whenever state changes.
 */

const STORAGE_KEY = "mindfries-ide-workspace";

export interface PersistedWorkspace {
  tree: TreeNode[];
  files: FileContents;
  savedFiles: FileContents;
  openPaths: string[];
  activePath: string | null;
}

export function loadPersistedWorkspace(): PersistedWorkspace | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspace>;
    if (!Array.isArray(parsed.tree) || typeof parsed.files !== "object") return null;
    return {
      tree: parsed.tree,
      files: parsed.files ?? {},
      savedFiles: parsed.savedFiles ?? parsed.files ?? {},
      openPaths: Array.isArray(parsed.openPaths) ? parsed.openPaths : [],
      activePath: typeof parsed.activePath === "string" ? parsed.activePath : null,
    };
  } catch {
    return null; // corrupt/unavailable storage — just start empty, don't crash the app
  }
}

export function savePersistedWorkspace(state: PersistedWorkspace): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full/unavailable (private browsing, quota, etc.) — silently skip;
    // the workspace still works, it just won't survive this particular refresh.
  }
}
