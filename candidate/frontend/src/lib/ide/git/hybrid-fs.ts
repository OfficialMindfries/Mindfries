import type { VfsBridge } from "../vfs-bridge";
import { findNode } from "../tree";
import { idbDelete, idbGet, idbKeys, idbPut } from "./idb";

/**
 * The filesystem isomorphic-git talks to. It's a hybrid on purpose:
 *
 *   /.git/**  -> IndexedDB (binary-safe: git objects are compressed binary)
 *   everything else -> the workspace VFS (text, and visible in the Explorer)
 *
 * So the working tree stays the files the user can actually see and edit,
 * while git's internals live somewhere that won't corrupt them.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** isomorphic-git checks `err.code`, so failures have to look like real fs errors. */
function fsError(code: string, path: string, message: string): Error & { code: string } {
  const error = new Error(`${message}: ${path}`) as Error & { code: string };
  error.code = code;
  return error;
}

/**
 * Absolute, with `.`/`..`/empty segments resolved away. isomorphic-git passes
 * bare relative paths in places (it calls `lstat(".")` while walking the
 * working tree), so a naive "prefix a slash" turns "." into "/." and every
 * status/checkout fails with ENOENT.
 */
function normalize(path: string): string {
  const segments: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return `/${segments.join("/")}`;
}

function isGitPath(path: string): boolean {
  return path === "/.git" || path.startsWith("/.git/");
}

/** "/src/a.ts" -> "src/a.ts" (the VFS has no leading slash; "" is the root). */
function toVfsPath(path: string): string {
  return normalize(path).replace(/^\//, "");
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? encoder.encode(data) : data;
}

type Encoding = { encoding?: string } | string | undefined;

function wantsText(options: Encoding): boolean {
  return typeof options === "string" ? true : options?.encoding === "utf8";
}

interface StatLike {
  type: "file" | "dir";
  mode: number;
  size: number;
  ino: number;
  mtimeMs: number;
  ctimeMs: number;
  uid: number;
  gid: number;
  dev: number;
  isFile: () => boolean;
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
}

function makeStat(type: "file" | "dir", size: number): StatLike {
  return {
    type,
    mode: type === "dir" ? 0o040755 : 0o100644,
    size,
    // These are only used to cache "has this file changed?"; holding them
    // constant just means isomorphic-git re-hashes instead of trusting a
    // timestamp, which is correct (only slower) on a virtual filesystem.
    ino: 0,
    mtimeMs: 0,
    ctimeMs: 0,
    uid: 0,
    gid: 0,
    dev: 0,
    isFile: () => type === "file",
    isDirectory: () => type === "dir",
    isSymbolicLink: () => false,
  };
}

export function createHybridFs(vfs: VfsBridge) {
  const readFile = async (path: string, options?: Encoding): Promise<string | Uint8Array> => {
    const full = normalize(path);

    if (isGitPath(full)) {
      const entry = await idbGet(full);
      if (!entry || entry.type !== "file") throw fsError("ENOENT", full, "ENOENT: no such file or directory");
      return wantsText(options) ? decoder.decode(entry.data) : entry.data;
    }

    const node = findNode(vfs.getSnapshot().tree, toVfsPath(full));
    if (!node || node.type !== "file") throw fsError("ENOENT", full, "ENOENT: no such file or directory");
    const content = vfs.getSnapshot().files[node.path] ?? "";
    return wantsText(options) ? content : encoder.encode(content);
  };

  const writeFile = async (path: string, data: string | Uint8Array): Promise<void> => {
    const full = normalize(path);

    if (isGitPath(full)) {
      await ensureGitParents(full);
      await idbPut(full, { type: "file", data: toBytes(data) });
      return;
    }

    const text = typeof data === "string" ? data : decoder.decode(data);
    const error = vfs.write(toVfsPath(full), text);
    if (error) throw fsError("EACCES", full, error);
  };

  const unlink = async (path: string): Promise<void> => {
    const full = normalize(path);
    if (isGitPath(full)) {
      await idbDelete(full);
      return;
    }
    const error = vfs.remove(toVfsPath(full), false);
    if (error) throw fsError("ENOENT", full, error);
  };

  const readdir = async (path: string): Promise<string[]> => {
    const full = normalize(path);

    if (isGitPath(full)) {
      const prefix = full === "/" ? "/" : `${full}/`;
      const keys = await idbKeys();
      const names = new Set<string>();
      for (const key of keys) {
        if (!key.startsWith(prefix) || key === full) continue;
        names.add(key.slice(prefix.length).split("/")[0]);
      }
      if (names.size === 0 && !(await idbGet(full))) {
        throw fsError("ENOENT", full, "ENOENT: no such file or directory");
      }
      return [...names].sort();
    }

    const { tree } = vfs.getSnapshot();
    const vfsPath = toVfsPath(full);
    const children = vfsPath === "" ? tree : (findNode(tree, vfsPath) as { children?: typeof tree })?.children;
    if (!children) throw fsError("ENOENT", full, "ENOENT: no such file or directory");

    const names = children.map((child) => child.name);
    // The Explorer never shows `.git` (it isn't in the VFS at all), but git
    // itself expects to find it when it walks the root.
    if (vfsPath === "" && (await idbGet("/.git"))) names.push(".git");
    return names.sort();
  };

  const mkdir = async (path: string): Promise<void> => {
    const full = normalize(path);
    if (isGitPath(full)) {
      await ensureGitParents(full);
      await idbPut(full, { type: "dir" });
      return;
    }
    const error = vfs.createFolder(toVfsPath(full));
    // A directory that already exists is EEXIST, which isomorphic-git handles.
    if (error) throw fsError("EEXIST", full, error);
  };

  const rmdir = async (path: string): Promise<void> => {
    const full = normalize(path);
    if (isGitPath(full)) {
      await idbDelete(full);
      return;
    }
    const error = vfs.remove(toVfsPath(full), true);
    if (error) throw fsError("ENOENT", full, error);
  };

  const stat = async (path: string): Promise<StatLike> => {
    const full = normalize(path);

    if (isGitPath(full)) {
      const entry = await idbGet(full);
      if (entry) {
        return entry.type === "file" ? makeStat("file", entry.data.length) : makeStat("dir", 0);
      }
      // Directories are implied by their children when git never mkdir'd them.
      const keys = await idbKeys();
      if (keys.some((key) => key.startsWith(`${full}/`))) return makeStat("dir", 0);
      throw fsError("ENOENT", full, "ENOENT: no such file or directory");
    }

    const vfsPath = toVfsPath(full);
    if (vfsPath === "") return makeStat("dir", 0);

    const snapshot = vfs.getSnapshot();
    const node = findNode(snapshot.tree, vfsPath);
    if (!node) throw fsError("ENOENT", full, "ENOENT: no such file or directory");
    return node.type === "file"
      ? makeStat("file", (snapshot.files[node.path] ?? "").length)
      : makeStat("dir", 0);
  };

  /** IndexedDB is flat, so parent directory markers are created on demand. */
  const ensureGitParents = async (path: string): Promise<void> => {
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const parent = `/${parts.slice(0, i).join("/")}`;
      if (!(await idbGet(parent))) await idbPut(parent, { type: "dir" });
    }
  };

  const promises = {
    readFile,
    writeFile,
    unlink,
    readdir,
    mkdir,
    rmdir,
    stat,
    // No symlinks on a virtual filesystem — reporting that honestly is what
    // makes isomorphic-git treat everything as a regular file.
    lstat: stat,
    readlink: async (path: string): Promise<string> => {
      throw fsError("EINVAL", normalize(path), "EINVAL: not a symlink");
    },
    symlink: async (): Promise<void> => {
      throw fsError("EPERM", "", "EPERM: symlinks are not supported");
    },
  };

  return { promises };
}

export type HybridFs = ReturnType<typeof createHybridFs>;
