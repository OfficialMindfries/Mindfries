export interface FileNode {
  type: "file";
  path: string;
  name: string;
}

export interface FolderNode {
  type: "folder";
  path: string;
  name: string;
  children: TreeNode[];
}

export type TreeNode = FileNode | FolderNode;

export type FileContents = Record<string, string>;
