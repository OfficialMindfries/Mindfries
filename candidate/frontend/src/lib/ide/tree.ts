import type { FolderNode, TreeNode } from "./types";

function joinPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

/** Recursively renumbers `path` under a renamed/moved folder subtree. */
function reparent(node: TreeNode, newBasePath: string): TreeNode {
  if (node.type === "file") {
    return { ...node, path: newBasePath };
  }
  return {
    ...node,
    path: newBasePath,
    children: node.children.map((child) =>
      reparent(child, joinPath(newBasePath, child.name))
    ),
  };
}

export function addNode(
  tree: TreeNode[],
  parentPath: string | null,
  node: TreeNode
): TreeNode[] {
  if (parentPath === null) {
    return [...tree, node];
  }
  return tree.map((n) => {
    if (n.type === "folder" && n.path === parentPath) {
      return { ...n, children: [...n.children, node] };
    }
    if (n.type === "folder") {
      return { ...n, children: addNode(n.children, parentPath, node) };
    }
    return n;
  });
}

export function removeNode(tree: TreeNode[], path: string): TreeNode[] {
  return tree
    .filter((n) => n.path !== path)
    .map((n) =>
      n.type === "folder" ? { ...n, children: removeNode(n.children, path) } : n
    );
}

export function renameNode(tree: TreeNode[], path: string, newName: string): TreeNode[] {
  return tree.map((n) => {
    if (n.path === path) {
      const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      const newPath = joinPath(parentPath, newName);
      return reparent({ ...n, name: newName }, newPath);
    }
    if (n.type === "folder") {
      return { ...n, children: renameNode(n.children, path, newName) };
    }
    return n;
  });
}

/**
 * Moves (and/or renames) a node to a new parent folder / name, preserving
 * its full subtree. Returns null (leaving the tree unchanged) if the
 * source doesn't exist.
 */
export function moveNode(
  tree: TreeNode[],
  srcPath: string,
  destParentPath: string | null,
  destName: string
): TreeNode[] | null {
  const node = findNode(tree, srcPath);
  if (!node) return null;
  const newPath = joinPath(destParentPath ?? "", destName);
  const moved = reparent({ ...node, name: destName }, newPath);
  return addNode(removeNode(tree, srcPath), destParentPath, moved);
}

/** All file paths that would be removed if `path` (file or folder) were deleted. */
export function collectFilePaths(tree: TreeNode[], path: string): string[] {
  const found = findNode(tree, path);
  if (!found) return [];
  return listFiles(found);
}

function listFiles(node: TreeNode): string[] {
  if (node.type === "file") return [node.path];
  return node.children.flatMap(listFiles);
}

export function findNode(tree: TreeNode[], path: string): TreeNode | undefined {
  for (const n of tree) {
    if (n.path === path) return n;
    if (n.type === "folder") {
      const found = findNode(n.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

export function siblingNames(tree: TreeNode[], parentPath: string | null): string[] {
  if (parentPath === null) return tree.map((n) => n.name);
  const parent = findNode(tree, parentPath) as FolderNode | undefined;
  return parent?.children.map((n) => n.name) ?? [];
}
