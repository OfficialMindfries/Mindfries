"use client";

import dynamic from "next/dynamic";
import clsx from "clsx";
import { X } from "lucide-react";
import { loader, type OnMount } from "@monaco-editor/react";
import { languageForPath } from "@/lib/ide/language";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import { NotebookEditor } from "./NotebookEditor";

// Self-hosted instead of the library's CDN default (jsdelivr): assets are
// copied to public/monaco-editor/vs by scripts/copy-monaco.js, so the
// editor works offline and doesn't depend on a third party at runtime.
loader.config({ paths: { vs: "/monaco-editor/vs" } });

// Monaco touches `window`/`navigator` at import time, so it can only load
// on the client — never during SSR.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface EditorPanelProps {
  theme: IdeTheme;
  openPaths: string[];
  activePath: string | null;
  dirtyPaths: Set<string>;
  content: string;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onChange: (path: string, value: string) => void;
  onSave: (path: string) => void;
}

export function EditorPanel({
  theme,
  openPaths,
  activePath,
  dirtyPaths,
  content,
  onSelectTab,
  onCloseTab,
  onChange,
  onSave,
}: EditorPanelProps) {
  const handleMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activePath) onSave(activePath);
    });
  };

  const palette = idePalette(theme);

  return (
    <div className={clsx("flex h-full min-w-0 flex-1 flex-col", palette.appBg)}>
      <div className={clsx("flex h-9 shrink-0 items-stretch overflow-x-auto border-b", palette.border)}>
        {openPaths.map((path) => {
          const isActive = path === activePath;
          const isDirty = dirtyPaths.has(path);
          const name = path.split("/").pop() ?? path;
          return (
            <div
              key={path}
              className={clsx(
                "group flex shrink-0 cursor-pointer items-center gap-2 border-r px-3 text-sm",
                isActive && "rounded-t-[4px]",
                palette.border,
                isActive ? palette.tabActiveBg : palette.tabInactiveBg,
                isActive ? palette.text : palette.textMuted
              )}
              onClick={() => onSelectTab(path)}
              title={path}
            >
              <span className="max-w-[160px] truncate">{name}</span>
              <button
                type="button"
                className={clsx(
                  "flex h-4 w-4 items-center justify-center rounded-[3px]",
                  palette.hover
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(path);
                }}
              >
                {isDirty ? (
                  <span className="h-2 w-2 rounded-full bg-current group-hover:hidden" />
                ) : null}
                <X size={12} className={isDirty ? "hidden group-hover:block" : ""} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        {activePath && languageForPath(activePath) === "ipynb" ? (
          <NotebookEditor
            key={activePath}
            theme={theme}
            content={content}
            onChange={(value) => onChange(activePath, value)}
            onSave={() => onSave(activePath)}
          />
        ) : activePath ? (
          <MonacoEditor
            key={activePath}
            path={activePath}
            language={languageForPath(activePath)}
            value={content}
            theme={theme === "dark" ? "vs-dark" : "light"}
            onChange={(value) => onChange(activePath, value ?? "")}
            onMount={handleMount}
            options={{
              fontSize: 13,
              minimap: { enabled: true },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2,
            }}
          />
        ) : (
          <div className={clsx("flex h-full items-center justify-center text-sm", palette.textMuted)}>
            Select a file to start editing
          </div>
        )}
      </div>
    </div>
  );
}
