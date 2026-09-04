"use client";

import { useState, type MouseEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FilePlus,
  FolderPlus,
  LogOut,
  Pencil,
  Trash2,
} from "lucide-react";
import { FileTypeIcon } from "./FileTypeIcon";
import clsx from "clsx";
import type { TreeNode } from "@/lib/ide/types";
import { siblingNames } from "@/lib/ide/tree";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";

interface NewEntryDraft {
  parentPath: string | null;
  kind: "file" | "folder";
}

interface FileExplorerProps {
  tree: TreeNode[];
  activePath: string | null;
  theme: IdeTheme;
  onOpenFile: (path: string) => void;
  onCreate: (parentPath: string | null, kind: "file" | "folder", name: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onEndSession: () => void;
}

export function FileExplorer({
  tree,
  activePath,
  theme,
  onOpenFile,
  onCreate,
  onRename,
  onDelete,
  onEndSession,
}: FileExplorerProps) {
  const palette = idePalette(theme);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["src", "tests"]));
  const [draft, setDraft] = useState<NewEntryDraft | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const toggleExpanded = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const startCreate = (parentPath: string | null, kind: "file" | "folder") => {
    if (parentPath) setExpanded((prev) => new Set(prev).add(parentPath));
    setDraft({ parentPath, kind });
  };

  const commitDraft = (name: string) => {
    if (draft && name.trim()) {
      onCreate(draft.parentPath, draft.kind, name.trim());
    }
    setDraft(null);
  };

  const commitRename = (path: string, name: string) => {
    if (name.trim()) onRename(path, name.trim());
    setRenaming(null);
  };

  return (
    <div className={clsx("flex h-full flex-col text-sm select-none", palette.panelBg, palette.text)}>
      <div
        className={clsx(
          "flex items-center justify-between border-b px-3 py-2 text-xs font-semibold tracking-wide uppercase",
          palette.border,
          palette.textMuted
        )}
      >
        <span className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG, no optimization needed */}
          <img src="/mindfries-logo.svg" alt="" width={22} height={22} />
          Mindfries
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="New File"
            className={clsx("rounded p-1", palette.hover)}
            onClick={() => startCreate(null, "file")}
          >
            <FilePlus size={14} />
          </button>
          <button
            type="button"
            title="New Folder"
            className={clsx("rounded p-1", palette.hover)}
            onClick={() => startCreate(null, "folder")}
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto py-1">
        <TreeLevel
          nodes={tree}
          depth={0}
          expanded={expanded}
          activePath={activePath}
          theme={theme}
          draft={draft}
          renaming={renaming}
          onToggleExpanded={toggleExpanded}
          onOpenFile={onOpenFile}
          onStartCreate={startCreate}
          onCommitDraft={commitDraft}
          onCancelDraft={() => setDraft(null)}
          onStartRename={setRenaming}
          onCommitRename={commitRename}
          onCancelRename={() => setRenaming(null)}
          onDelete={onDelete}
          existingSiblingNames={(parentPath) => siblingNames(tree, parentPath)}
        />
        {draft?.parentPath === null && (
          <InlineInput
            depth={0}
            theme={theme}
            placeholder={draft.kind === "file" ? "file-name.ts" : "folder-name"}
            onCommit={commitDraft}
            onCancel={() => setDraft(null)}
          />
        )}
      </div>

      <SidebarFooter theme={theme} onEndSession={onEndSession} />
    </div>
  );
}

/** The signed-in candidate, pinned to the bottom of the Explorer. AI help
 * moved out to the floating launcher (ChatLauncher). */
function SidebarFooter({ theme, onEndSession }: { theme: IdeTheme; onEndSession: () => void }) {
  const palette = idePalette(theme);

  return (
    <div className={clsx("shrink-0 border-t", palette.border)}>
      <div className={clsx("flex items-center gap-2 px-3 py-2", palette.border)}>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4A7FA7] text-[11px] font-semibold text-[#F6FAFD]">
          R
        </span>
        <span className="min-w-0 flex-1">
          <span className={clsx("block truncate text-xs", palette.text)}>Rishi</span>
          <span className={clsx("block truncate text-[10px]", palette.textMuted)}>Candidate</span>
        </span>
        {/* The workspace's own exit. It's here rather than somewhere more
            prominent on purpose: ending is deliberate, not something to hit
            while reaching for a tab. */}
        <button
          type="button"
          title="End session"
          aria-label="End session"
          onClick={onEndSession}
          className={clsx("shrink-0 rounded-md p-1.5", palette.hover, palette.textMuted)}
        >
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}

interface TreeLevelProps {
  nodes: TreeNode[];
  depth: number;
  expanded: Set<string>;
  activePath: string | null;
  theme: IdeTheme;
  draft: NewEntryDraft | null;
  renaming: string | null;
  onToggleExpanded: (path: string) => void;
  onOpenFile: (path: string) => void;
  onStartCreate: (parentPath: string | null, kind: "file" | "folder") => void;
  onCommitDraft: (name: string) => void;
  onCancelDraft: () => void;
  onStartRename: (path: string) => void;
  onCommitRename: (path: string, name: string) => void;
  onCancelRename: () => void;
  onDelete: (path: string) => void;
  existingSiblingNames: (parentPath: string | null) => string[];
}

function TreeLevel({
  nodes,
  depth,
  expanded,
  activePath,
  theme,
  draft,
  renaming,
  onToggleExpanded,
  onOpenFile,
  onStartCreate,
  onCommitDraft,
  onCancelDraft,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  existingSiblingNames,
}: TreeLevelProps) {
  const palette = idePalette(theme);
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {sorted.map((node) => {
        const isActive = node.path === activePath;
        const isRenaming = renaming === node.path;
        const paddingLeft = 12 + depth * 14;

        if (node.type === "file") {
          return (
            <div key={node.path} className="group">
              {isRenaming ? (
                <InlineInput
                  depth={depth}
                  theme={theme}
                  initialValue={node.name}
                  onCommit={(name) => onCommitRename(node.path, name)}
                  onCancel={onCancelRename}
                />
              ) : (
                <div
                  className={clsx(
                    "mx-1 flex cursor-pointer items-center justify-between rounded-[4px] py-[3px] pr-2",
                    palette.hover,
                    isActive && palette.active
                  )}
                  style={{ paddingLeft }}
                  onClick={() => onOpenFile(node.path)}
                  onDoubleClick={() => onStartRename(node.path)}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FileTypeIcon name={node.name} />
                    <span className="truncate">{node.name}</span>
                  </span>
                  <RowActions
                    theme={theme}
                    onRename={() => onStartRename(node.path)}
                    onDelete={() => onDelete(node.path)}
                  />
                </div>
              )}
            </div>
          );
        }

        const isOpen = expanded.has(node.path);
        return (
          <div key={node.path}>
            {isRenaming ? (
              <InlineInput
                depth={depth}
                theme={theme}
                initialValue={node.name}
                onCommit={(name) => onCommitRename(node.path, name)}
                onCancel={onCancelRename}
              />
            ) : (
              <div
                className={clsx(
                  "group mx-1 flex cursor-pointer items-center justify-between rounded-[4px] py-[3px] pr-2",
                  palette.hover
                )}
                style={{ paddingLeft }}
                onClick={() => onToggleExpanded(node.path)}
                onDoubleClick={() => onStartRename(node.path)}
              >
                <span className="flex min-w-0 items-center gap-1">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {isOpen ? (
                    <FolderOpen size={14} className={palette.accent} />
                  ) : (
                    <Folder size={14} className={palette.accent} />
                  )}
                  <span className="truncate">{node.name}</span>
                </span>
                <RowActions
                  theme={theme}
                  onNewFile={(e) => {
                    e.stopPropagation();
                    onStartCreate(node.path, "file");
                  }}
                  onNewFolder={(e) => {
                    e.stopPropagation();
                    onStartCreate(node.path, "folder");
                  }}
                  onRename={() => onStartRename(node.path)}
                  onDelete={() => onDelete(node.path)}
                />
              </div>
            )}
            {isOpen && (
              <TreeLevel
                nodes={node.children}
                depth={depth + 1}
                expanded={expanded}
                activePath={activePath}
                theme={theme}
                draft={draft}
                renaming={renaming}
                onToggleExpanded={onToggleExpanded}
                onOpenFile={onOpenFile}
                onStartCreate={onStartCreate}
                onCommitDraft={onCommitDraft}
                onCancelDraft={onCancelDraft}
                onStartRename={onStartRename}
                onCommitRename={onCommitRename}
                onCancelRename={onCancelRename}
                onDelete={onDelete}
                existingSiblingNames={existingSiblingNames}
              />
            )}
            {isOpen && draft?.parentPath === node.path && (
              <InlineInput
                depth={depth + 1}
                theme={theme}
                placeholder={draft.kind === "file" ? "file-name.ts" : "folder-name"}
                onCommit={onCommitDraft}
                onCancel={onCancelDraft}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function RowActions({
  theme,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: {
  theme: IdeTheme;
  onNewFile?: (e: MouseEvent) => void;
  onNewFolder?: (e: MouseEvent) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const palette = idePalette(theme);
  return (
    <span className="hidden items-center gap-0.5 group-hover:flex">
      {onNewFile && (
        <button type="button" title="New File" className={clsx("rounded p-0.5", palette.hover)} onClick={onNewFile}>
          <FilePlus size={12} />
        </button>
      )}
      {onNewFolder && (
        <button type="button" title="New Folder" className={clsx("rounded p-0.5", palette.hover)} onClick={onNewFolder}>
          <FolderPlus size={12} />
        </button>
      )}
      <button
        type="button"
        title="Rename"
        className={clsx("rounded p-0.5", palette.hover)}
        onClick={(e) => {
          e.stopPropagation();
          onRename();
        }}
      >
        <Pencil size={12} />
      </button>
      <button
        type="button"
        title="Delete"
        className={clsx("rounded p-0.5", palette.hover)}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 size={12} />
      </button>
    </span>
  );
}

function InlineInput({
  depth,
  theme,
  initialValue = "",
  placeholder,
  onCommit,
  onCancel,
}: {
  depth: number;
  theme: IdeTheme;
  initialValue?: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const palette = idePalette(theme);
  const [value, setValue] = useState(initialValue);

  return (
    <div style={{ paddingLeft: 12 + depth * 14 }} className="py-[2px] pr-2">
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => (value.trim() ? onCommit(value) : onCancel())}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit(value);
          if (e.key === "Escape") onCancel();
        }}
        className={clsx(
          "w-full rounded border px-1 py-0.5 text-sm outline-none",
          palette.border,
          palette.appBg,
          palette.text
        )}
      />
    </div>
  );
}
