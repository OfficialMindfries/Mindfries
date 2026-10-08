import type { FileContents, TreeNode } from "./types";

/**
 * Persists the workspace's virtual filesystem to this browser's
 * localStorage, so it survives a refresh.
 *
 * Each assessment session has its own saved workspace, under its own key.
 * They used to share one — so a candidate who had finished one assessment
 * opened their next to find the previous one's files sitting in it, on top
 * of the task they'd just been given. A workspace opened without a session
 * (the scratch workspace) keeps the original key.
 *
 * This copy is the fast one: it's written on every change and read on
 * reload. It is not the only one — the workspace is also saved to the
 * server every minute or so (IdeShell's checkpoint), which is what a
 * different browser, or this one after its storage was cleared, restores
 * from. `savedAt` is what lets the two be compared: whichever is newer is
 * the candidate's latest work.
 */

const SCRATCH_KEY = "mindfries-ide-workspace";
const keyFor = (sessionId?: string) => (sessionId ? `${SCRATCH_KEY}:${sessionId}` : SCRATCH_KEY);

export interface PersistedWorkspace {
  tree: TreeNode[];
  files: FileContents;
  savedFiles: FileContents;
  openPaths: string[];
  activePath: string | null;
  /** When this copy was written, in ms since the epoch. 0 for one saved before this was recorded. */
  savedAt?: number;
}

export function loadPersistedWorkspace(sessionId?: string): PersistedWorkspace | null {
  try {
    const raw = window.localStorage.getItem(keyFor(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspace>;
    if (!Array.isArray(parsed.tree) || typeof parsed.files !== "object") return null;
    return {
      tree: parsed.tree,
      files: parsed.files ?? {},
      savedFiles: parsed.savedFiles ?? parsed.files ?? {},
      openPaths: Array.isArray(parsed.openPaths) ? parsed.openPaths : [],
      activePath: typeof parsed.activePath === "string" ? parsed.activePath : null,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null; // corrupt/unavailable storage — just start empty, don't crash the app
  }
}

export function savePersistedWorkspace(state: PersistedWorkspace, sessionId?: string): void {
  try {
    window.localStorage.setItem(keyFor(sessionId), JSON.stringify({ ...state, savedAt: Date.now() }));
  } catch {
    // Storage full/unavailable (private browsing, quota, etc.) — silently skip;
    // the workspace still works, it just won't survive this particular refresh.
  }
}

/**
 * Which copy of a session's work to open with: this browser's, or the
 * server's. The newer one — except that once the work is frozen (the
 * interview has begun) the server's copy is the work, whatever this browser
 * holds.
 */
export function pickWorkspace(
  local: PersistedWorkspace | null,
  server: { files: FileContents; savedAt: number; frozen: boolean } | null,
): "local" | "server" | "none" {
  if (server && Object.keys(server.files).length > 0) {
    if (server.frozen || !local) return "server";
    return (local.savedAt ?? 0) >= server.savedAt ? "local" : "server";
  }
  return local ? "local" : "none";
}
