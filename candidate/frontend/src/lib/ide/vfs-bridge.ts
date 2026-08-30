import type { FileContents, TreeNode } from "./types";

/**
 * The interface the terminal's shell (vfs-shell.ts) uses to read/mutate
 * the SAME file tree the Explorer and Editor show — implemented by
 * IdeShell, which owns that state. Mutators return an error string on
 * failure (matching real shell error messages) or null on success, since
 * the terminal needs a synchronous answer to print immediately.
 */
export interface VfsBridge {
  /** Always-current snapshot — reads must never see stale data from terminal-mount time. */
  getSnapshot: () => { tree: TreeNode[]; files: FileContents };
  createFile: (path: string, content?: string) => string | null;
  createFolder: (path: string) => string | null;
  /** Removes a file, or a folder when recursive is true. */
  remove: (path: string, recursive: boolean) => string | null;
  /** Creates or overwrites (or appends to, when append is true) a file's content. */
  write: (path: string, content: string, append?: boolean) => string | null;
  /** Moves/renames a file or folder (with its full subtree) to a new parent folder and/or name. */
  move: (srcPath: string, destParentPath: string | null, destName: string) => string | null;
}
