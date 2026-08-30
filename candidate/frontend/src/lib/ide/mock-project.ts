import type { FileContents, TreeNode } from "./types";

/**
 * The workspace starts empty — no sample/hardcoded files. What you create
 * is persisted to this browser's localStorage (see IdeShell's fsPersist
 * effect), so it survives a refresh — it's just not backed by a real
 * filesystem or a server anywhere. Create files via the Explorer or the
 * terminal (`touch`, `mkdir`, `echo ... > file`).
 */
export const initialTree: TreeNode[] = [];

export const initialFiles: FileContents = {};

export const DEFAULT_OPEN_PATH: string | null = null;
