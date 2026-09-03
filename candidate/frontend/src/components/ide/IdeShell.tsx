"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { GripVertical, GripHorizontal } from "lucide-react";
import { FileExplorer } from "./FileExplorer";
import { Breadcrumbs } from "./Breadcrumbs";
import { EditorPanel } from "./EditorPanel";
import { BottomPanel } from "./BottomPanel";
import { StatusBar } from "./StatusBar";
import { PackageCleanupGuard } from "./PackageCleanupGuard";
import { useIdeTheme } from "@/lib/ide/theme";
import { idePalette } from "@/lib/ide/palette";
import { initialTree, initialFiles, DEFAULT_OPEN_PATH } from "@/lib/ide/mock-project";
import { addNode, collectFilePaths, findNode, moveNode, removeNode } from "@/lib/ide/tree";
import type { FileContents, TreeNode } from "@/lib/ide/types";
import type { VfsBridge } from "@/lib/ide/vfs-bridge";
import { emptyNotebookJson } from "@/lib/ide/notebook";
import { loadPersistedWorkspace, savePersistedWorkspace } from "@/lib/ide/fs-persist";
import { useResizable } from "@/lib/ide/use-resizable";

export function IdeShell() {
  const { theme, toggleTheme } = useIdeTheme();
  const palette = idePalette(theme);

  const [tree, setTree] = useState<TreeNode[]>(initialTree);
  const [files, setFiles] = useState<FileContents>(initialFiles);
  const [savedFiles, setSavedFiles] = useState<FileContents>(initialFiles);
  const [openPaths, setOpenPaths] = useState<string[]>(DEFAULT_OPEN_PATH ? [DEFAULT_OPEN_PATH] : []);
  const [activePath, setActivePath] = useState<string | null>(DEFAULT_OPEN_PATH);

  const dirtyPaths = useMemo(() => {
    const dirty = new Set<string>();
    for (const path of openPaths) {
      if (files[path] !== savedFiles[path]) dirty.add(path);
    }
    return dirty;
  }, [openPaths, files, savedFiles]);

  // Restore whatever was here last time — localStorage only exists client-side,
  // so this has to happen post-mount (matches the theme provider's same pattern).
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    // localStorage is only reachable client-side, so this restore can only
    // happen post-mount — same unavoidable pattern as theme.tsx's read.
    /* eslint-disable react-hooks/set-state-in-effect */
    const saved = loadPersistedWorkspace();
    if (saved) {
      setTree(saved.tree);
      setFiles(saved.files);
      setSavedFiles(saved.savedFiles);
      setOpenPaths(saved.openPaths);
      setActivePath(saved.activePath);
    }
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Persist on every change, debounced so fast typing doesn't hit
  // localStorage on every keystroke. Skipped until the restore above has
  // run, so a fresh mount doesn't briefly overwrite saved data with the
  // empty initial state.
  useEffect(() => {
    if (!restored) return;
    const timeout = setTimeout(() => {
      savePersistedWorkspace({ tree, files, savedFiles, openPaths, activePath });
    }, 300);
    return () => clearTimeout(timeout);
  }, [restored, tree, files, savedFiles, openPaths, activePath]);

  // Auto Save, on by default (no setting to flip it off yet — ask if you
  // want that toggle). A short delay after you stop typing, whatever's
  // dirty gets marked saved — Ctrl/Cmd+S still works too, for an
  // immediate save without waiting out the debounce.
  useEffect(() => {
    if (dirtyPaths.size === 0) return;
    const timeout = setTimeout(() => {
      setSavedFiles((prev) => {
        const next = { ...prev };
        for (const path of dirtyPaths) next[path] = files[path];
        return next;
      });
    }, 800);
    return () => clearTimeout(timeout);
  }, [dirtyPaths, files]);

  const sidebar = useResizable({ initial: 240, min: 160, max: 480, axis: "horizontal" });
  const terminal = useResizable({ initial: 220, min: 100, max: 520, axis: "vertical", invert: true });

  const openFile = (path: string) => {
    setOpenPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActivePath(path);
  };

  const closeTab = (path: string) => {
    const isDirty = files[path] !== savedFiles[path];
    if (isDirty && !window.confirm(`${path} has unsaved changes. Close anyway?`)) {
      return;
    }
    setOpenPaths((prev) => {
      const next = prev.filter((p) => p !== path);
      if (activePath === path) {
        setActivePath(next.length > 0 ? next[next.length - 1] : null);
      }
      return next;
    });
  };

  const changeFile = (path: string, value: string) => {
    setFiles((prev) => ({ ...prev, [path]: value }));
  };

  const saveFile = (path: string) => {
    setSavedFiles((prev) => ({ ...prev, [path]: files[path] }));
  };

  // --- Virtual filesystem: the single source of truth shared by the
  // Explorer, the Editor, AND the terminal (see vfs-shell.ts). The
  // terminal runs commands from an xterm callback, outside React's render
  // cycle, so it needs a *synchronous* read of the current tree/files —
  // hence the ref, kept in sync every render. Mutators use functional
  // setState, so they're always correct regardless of when they run.
  const vfsSnapshotRef = useRef({ tree, files });
  useEffect(() => {
    vfsSnapshotRef.current = { tree, files };
  });

  /**
   * Writes the mutation into the snapshot ref *synchronously* before queuing
   * the React update. This matters as soon as one command line can run more
   * than one command (`echo hi > a.txt && cat a.txt`): every command in that
   * line executes within a single tick, long before React re-renders, so a
   * ref that only refreshed on render would hand the second command a
   * filesystem that doesn't have the first command's file in it yet.
   */
  const syncSnapshot = (next: { tree?: TreeNode[]; files?: FileContents }) => {
    vfsSnapshotRef.current = {
      tree: next.tree ?? vfsSnapshotRef.current.tree,
      files: next.files ?? vfsSnapshotRef.current.files,
    };
  };

  const vfsCreateFile = (path: string, content = ""): string | null => {
    const { tree: t, files: f } = vfsSnapshotRef.current;
    if (findNode(t, path)) return "File exists";
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : null;
    if (parentPath && !findNode(t, parentPath)) return "No such file or directory";
    const name = path.split("/").pop() as string;

    const nextTree = addNode(t, parentPath, { type: "file", path, name });
    const nextFiles = { ...f, [path]: content };
    syncSnapshot({ tree: nextTree, files: nextFiles });
    setTree(nextTree);
    setFiles(nextFiles);
    setSavedFiles((prev) => ({ ...prev, [path]: content }));
    return null;
  };

  const vfsCreateFolder = (path: string): string | null => {
    const { tree: t } = vfsSnapshotRef.current;
    if (findNode(t, path)) return "File exists";
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : null;
    if (parentPath && !findNode(t, parentPath)) return "No such file or directory";
    const name = path.split("/").pop() as string;

    const nextTree = addNode(t, parentPath, { type: "folder", path, name, children: [] });
    syncSnapshot({ tree: nextTree });
    setTree(nextTree);
    return null;
  };

  const vfsRemove = (path: string, recursive: boolean): string | null => {
    const { tree: t, files: f } = vfsSnapshotRef.current;
    const node = findNode(t, path);
    if (!node) return "No such file or directory";
    if (node.type === "folder" && !recursive) return "Is a directory";
    const removedFiles = collectFilePaths(t, path);

    const nextTree = removeNode(t, path);
    const nextFiles = omit(f, removedFiles);
    syncSnapshot({ tree: nextTree, files: nextFiles });
    setTree(nextTree);
    setFiles(nextFiles);
    setSavedFiles((prev) => omit(prev, removedFiles));
    setOpenPaths((prev) => {
      const next = prev.filter((p) => !removedFiles.includes(p));
      if (activePath && removedFiles.includes(activePath)) {
        setActivePath(next.length > 0 ? next[next.length - 1] : null);
      }
      return next;
    });
    return null;
  };

  const vfsWrite = (path: string, content: string, append = false): string | null => {
    const { tree: t, files: f } = vfsSnapshotRef.current;
    const existing = findNode(t, path);
    if (existing?.type === "folder") return "Is a directory";

    let nextTree = t;
    if (!existing) {
      const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : null;
      if (parentPath && !findNode(t, parentPath)) return "No such file or directory";
      const name = path.split("/").pop() as string;
      nextTree = addNode(t, parentPath, { type: "file", path, name });
    }

    const newContent = append ? (f[path] ?? "") + content : content;
    const nextFiles = { ...f, [path]: newContent };
    syncSnapshot({ tree: nextTree, files: nextFiles });
    setTree(nextTree);
    setFiles(nextFiles);
    setSavedFiles((prev) => ({ ...prev, [path]: newContent }));
    return null;
  };

  const vfsMove = (srcPath: string, destParentPath: string | null, destName: string): string | null => {
    const { tree: t } = vfsSnapshotRef.current;
    if (!findNode(t, srcPath)) return "No such file or directory";
    if (destParentPath && !findNode(t, destParentPath)) return "No such file or directory";
    const destPath = destParentPath ? `${destParentPath}/${destName}` : destName;
    if (destPath !== srcPath && findNode(t, destPath)) return "File exists";

    const oldFilePaths = collectFilePaths(t, srcPath);
    const nextTree = moveNode(t, srcPath, destParentPath, destName);
    if (!nextTree) return "No such file or directory";
    const newFilePaths = collectFilePaths(nextTree, destPath);

    syncSnapshot({ tree: nextTree });
    setTree(nextTree);
    remapFilePaths(oldFilePaths, newFilePaths);
    return null;
  };

  const remapFilePaths = (oldPaths: string[], newPaths: string[]) => {
    if (oldPaths.length !== newPaths.length) return;
    const mapping = new Map(oldPaths.map((old, i) => [old, newPaths[i]]));

    const nextFiles = remapKeys(vfsSnapshotRef.current.files, mapping);
    syncSnapshot({ files: nextFiles });
    setFiles(nextFiles);
    setSavedFiles((prev) => remapKeys(prev, mapping));
    setOpenPaths((prev) => prev.map((p) => mapping.get(p) ?? p));
    setActivePath((prev) => (prev ? mapping.get(prev) ?? prev : prev));
  };

  const vfs: VfsBridge = {
    getSnapshot: () => vfsSnapshotRef.current,
    createFile: vfsCreateFile,
    createFolder: vfsCreateFolder,
    remove: vfsRemove,
    write: vfsWrite,
    move: vfsMove,
  };

  // Explorer-driven create/rename/delete are the same virtual filesystem
  // operations the terminal uses, just with UI-appropriate confirmation
  // dialogs and auto-opening a newly created file in the editor.
  const createEntry = (parentPath: string | null, kind: "file" | "folder", name: string) => {
    const path = parentPath ? `${parentPath}/${name}` : name;
    const err =
      kind === "file"
        ? vfsCreateFile(path, name.toLowerCase().endsWith(".ipynb") ? emptyNotebookJson() : "")
        : vfsCreateFolder(path);
    if (err) {
      window.alert(err === "File exists" ? `"${name}" already exists here.` : err);
      return;
    }
    if (kind === "file") openFile(path);
  };

  const renameEntry = (path: string, newName: string) => {
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : null;
    const err = vfsMove(path, parentPath, newName);
    if (err) window.alert(err === "File exists" ? `"${newName}" already exists here.` : err);
  };

  const deleteEntry = (path: string) => {
    if (!window.confirm(`Delete "${path}"? This can't be undone.`)) return;
    vfsRemove(path, true);
  };

  // The chrome is a set of independent rounded "cards" (Explorer, Editor,
  // Terminal, status bar) floating on a recessed canvas, rather than VS
  // Code's flush edge-to-edge panels — every panel gets `overflow-hidden` so
  // its own (sharp-cornered) internal content is clipped to the card's
  // rounded shape instead of poking out past the corners.
  return (
    <div className={clsx("flex h-dvh w-full flex-col gap-1 p-1", palette.panelBg, palette.text)}>
      <div className="flex min-h-0 flex-1 gap-1">
        <div
          style={{ width: sidebar.size }}
          className={clsx("shrink-0 overflow-hidden rounded-xl border", palette.border)}
        >
          <FileExplorer
            tree={tree}
            activePath={activePath}
            theme={theme}
            onOpenFile={openFile}
            onCreate={createEntry}
            onRename={renameEntry}
            onDelete={deleteEntry}
          />
        </div>

        <div
          onMouseDown={sidebar.startDrag}
          className={clsx(
            "flex w-1 shrink-0 cursor-col-resize items-center justify-center rounded-full",
            palette.hover
          )}
        >
          <GripVertical size={10} className={palette.textMuted} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            className={clsx(
              "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border",
              palette.border
            )}
          >
            <Breadcrumbs path={activePath} theme={theme} />
            <div className="min-h-0 flex-1">
              <EditorPanel
                theme={theme}
                openPaths={openPaths}
                activePath={activePath}
                dirtyPaths={dirtyPaths}
                content={activePath ? files[activePath] ?? "" : ""}
                onSelectTab={setActivePath}
                onCloseTab={closeTab}
                onChange={changeFile}
                onSave={saveFile}
              />
            </div>
          </div>

          <div
            onMouseDown={terminal.startDrag}
            className={clsx(
              "flex h-1 shrink-0 cursor-row-resize items-center justify-center rounded-full",
              palette.hover
            )}
          >
            <GripHorizontal size={10} className={palette.textMuted} />
          </div>

          <div
            style={{ height: terminal.size }}
            className={clsx("shrink-0 overflow-hidden rounded-xl border", palette.border)}
          >
            <BottomPanel theme={theme} vfs={vfs} />
          </div>
        </div>
      </div>

      <div className={clsx("shrink-0 overflow-hidden rounded-xl border", palette.border)}>
        <StatusBar
          activePath={activePath}
          dirtyCount={dirtyPaths.size}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>

      <PackageCleanupGuard theme={theme} />
    </div>
  );
}

function omit(obj: FileContents, keys: string[]): FileContents {
  const keySet = new Set(keys);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keySet.has(k)));
}

function remapKeys(obj: FileContents, mapping: Map<string, string>): FileContents {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [mapping.get(k) ?? k, v])
  );
}
