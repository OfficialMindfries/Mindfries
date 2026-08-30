"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Play, Loader2, Trash2, Plus, Type, Code2, AlertCircle } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import {
  emptyNotebook,
  parseNotebook,
  serializeNotebook,
  type CellType,
  type NotebookCell,
  type NotebookDoc,
} from "@/lib/ide/notebook";
import { runJavaScript, runPython } from "@/lib/ide/code-runner";
import { TinyMarkdown } from "./tiny-markdown";

interface NotebookEditorProps {
  theme: IdeTheme;
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
}

/**
 * A Jupyter-like notebook interface for .ipynb files: cells run in order
 * against a real interpreter (Pyodide for Python, in-browser eval for JS)
 * and — like a real kernel — variables persist between cell runs within
 * the session. See lib/ide/notebook.ts for the (deliberately scoped-down)
 * nbformat support and lib/ide/code-runner.ts for execution.
 */
export function NotebookEditor({ theme, content, onChange, onSave }: NotebookEditorProps) {
  const palette = idePalette(theme);
  const [doc, setDoc] = useState<NotebookDoc>(() => (content.trim() ? parseNotebook(content) : emptyNotebook()));

  const commit = (next: NotebookDoc) => {
    setDoc(next);
    onChange(serializeNotebook(next));
  };

  const updateCell = (id: string, patch: Partial<NotebookCell>) => {
    commit({ ...doc, cells: doc.cells.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  };

  const addCell = (type: CellType, afterId?: string) => {
    const cell: NotebookCell = { id: `cell-${Date.now()}-${Math.random()}`, type, source: "", outputs: [], status: "idle" };
    if (!afterId) {
      commit({ ...doc, cells: [...doc.cells, cell] });
      return;
    }
    const index = doc.cells.findIndex((c) => c.id === afterId);
    const cells = [...doc.cells];
    cells.splice(index + 1, 0, cell);
    commit({ ...doc, cells });
  };

  const deleteCell = (id: string) => {
    commit({ ...doc, cells: doc.cells.filter((c) => c.id !== id) });
  };

  const runCell = async (cell: NotebookCell) => {
    if (cell.type !== "code") return;
    updateCell(cell.id, { status: "running" });
    const result =
      doc.kernelLanguage === "python" ? await runPython(cell.source) : runJavaScript(cell.source);
    updateCell(cell.id, { outputs: result.output, status: result.errored ? "error" : "idle" });
  };

  const runAll = async () => {
    for (const cell of doc.cells) {
      if (cell.type === "code") await runCell(cell);
    }
  };

  // Ctrl/Cmd+S — NotebookEditor doesn't go through Monaco, so it needs its own save shortcut.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSaveRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className={clsx("flex h-full flex-col overflow-auto", palette.appBg, palette.text)}>
      <div className={clsx("flex shrink-0 items-center gap-1 border-b px-2 py-1.5", palette.border)}>
        <button
          type="button"
          onClick={runAll}
          className={clsx("flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs", palette.hover)}
        >
          <Play size={12} />
          Run All
        </button>
        <button
          type="button"
          onClick={() => addCell("code")}
          className={clsx("flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs", palette.hover)}
        >
          <Code2 size={12} />+ Code
        </button>
        <button
          type="button"
          onClick={() => addCell("markdown")}
          className={clsx("flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs", palette.hover)}
        >
          <Type size={12} />+ Markdown
        </button>
        <span className={clsx("ml-auto text-xs", palette.textMuted)}>
          Kernel: {doc.kernelLanguage === "python" ? "Python 3 (Pyodide)" : "JavaScript"}
        </span>
      </div>

      <div className="flex-1 space-y-3 p-3">
        {doc.cells.map((cell) => (
          <NotebookCellView
            key={cell.id}
            cell={cell}
            theme={theme}
            onChangeSource={(source) => updateCell(cell.id, { source })}
            onRun={() => runCell(cell)}
            onDelete={() => deleteCell(cell.id)}
            onAddBelow={(type) => addCell(type, cell.id)}
          />
        ))}
      </div>
    </div>
  );
}

function NotebookCellView({
  cell,
  theme,
  onChangeSource,
  onRun,
  onDelete,
  onAddBelow,
}: {
  cell: NotebookCell;
  theme: IdeTheme;
  onChangeSource: (source: string) => void;
  onRun: () => void;
  onDelete: () => void;
  onAddBelow: (type: CellType) => void;
}) {
  const palette = idePalette(theme);
  const [editing, setEditing] = useState(cell.type === "code" || cell.source === "");

  return (
    <div className={clsx("group rounded-[6px] border", palette.border)}>
      <div className="flex items-stretch">
        <div className="flex w-10 shrink-0 flex-col items-center gap-1 py-2">
          {cell.type === "code" && (
            <button
              type="button"
              title="Run cell"
              onClick={onRun}
              disabled={cell.status === "running"}
              className={clsx("flex h-6 w-6 items-center justify-center rounded-[4px]", palette.hover)}
            >
              {cell.status === "running" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} className={cell.status === "error" ? "text-red-500" : palette.accent} />
              )}
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1 py-2 pr-2">
          {cell.type === "markdown" && !editing ? (
            <div onDoubleClick={() => setEditing(true)} className="cursor-text px-1">
              {cell.source.trim() ? (
                <TinyMarkdown text={cell.source} />
              ) : (
                <p className={clsx("text-xs italic", palette.textMuted)}>Empty markdown cell — double-click to edit</p>
              )}
            </div>
          ) : (
            <textarea
              value={cell.source}
              onChange={(e) => onChangeSource(e.target.value)}
              onBlur={() => cell.type === "markdown" && setEditing(false)}
              placeholder={cell.type === "code" ? "# code" : "Markdown text..."}
              rows={Math.max(2, cell.source.split("\n").length)}
              spellCheck={false}
              className={clsx(
                "w-full resize-none bg-transparent font-mono text-sm outline-none",
                palette.text
              )}
            />
          )}

          {cell.type === "code" && cell.outputs.length > 0 && (
            <div
              className={clsx(
                "mt-2 rounded-[4px] px-2 py-1.5 font-mono text-xs whitespace-pre-wrap",
                cell.status === "error" ? "text-red-500" : palette.textMuted,
                palette.panelBg
              )}
            >
              {cell.status === "error" && (
                <span className="mb-1 flex items-center gap-1 font-sans font-semibold">
                  <AlertCircle size={12} /> Error
                </span>
              )}
              {cell.outputs.join("")}
            </div>
          )}
        </div>

        <div className="hidden shrink-0 items-start gap-0.5 p-1 group-hover:flex">
          <button
            type="button"
            title="Delete cell"
            onClick={onDelete}
            className={clsx("rounded-[4px] p-1", palette.hover)}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <div className={clsx("hidden justify-center gap-1 border-t py-1 group-hover:flex", palette.border)}>
        <button
          type="button"
          onClick={() => onAddBelow("code")}
          className={clsx("flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[11px]", palette.hover, palette.textMuted)}
        >
          <Plus size={10} /> Code
        </button>
        <button
          type="button"
          onClick={() => onAddBelow("markdown")}
          className={clsx("flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[11px]", palette.hover, palette.textMuted)}
        >
          <Plus size={10} /> Markdown
        </button>
      </div>
    </div>
  );
}
