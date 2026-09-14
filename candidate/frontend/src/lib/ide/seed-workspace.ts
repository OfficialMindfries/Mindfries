import type { FileContents, TreeNode } from "./types";
import { addNode, findNode } from "./tree";

/**
 * Turns a flat {path: content} map — an assessment's real starter files,
 * from game_templates.starter_files via the backend's
 * GET /sessions/{id}/assessment — into the same {tree, files} shape
 * mock-project.ts's initialTree/initialFiles already are, so IdeShell's
 * initial state can come from either source interchangeably.
 *
 * Deliberately not built through the live VfsBridge (vfsWrite in
 * IdeShell.tsx): that API requires a file's parent folder to already exist,
 * one write at a time, which is right for a candidate typing `touch a/b.ts`
 * one command at a time but wrong for seeding — a real starter repo can
 * have however many nested folders, and they all need to exist before this
 * runs, not be built up through the same guard rails a live session uses.
 */
export function buildInitialWorkspace(starterFiles: FileContents): { tree: TreeNode[]; files: FileContents } {
  let tree: TreeNode[] = [];
  const files: FileContents = {};

  for (const rawPath of Object.keys(starterFiles)) {
    const path = rawPath.replace(/^\/+/, "").trim();
    if (!path) continue;

    const segments = path.split("/").filter(Boolean);
    let parentPath: string | null = null;
    for (let i = 0; i < segments.length - 1; i++) {
      const folderPath: string = parentPath ? `${parentPath}/${segments[i]}` : segments[i];
      if (!findNode(tree, folderPath)) {
        tree = addNode(tree, parentPath, { type: "folder", path: folderPath, name: segments[i], children: [] });
      }
      parentPath = folderPath;
    }

    if (!findNode(tree, path)) {
      const name = segments[segments.length - 1];
      tree = addNode(tree, parentPath, { type: "file", path, name });
    }
    files[path] = starterFiles[rawPath];
  }

  return { tree, files };
}
