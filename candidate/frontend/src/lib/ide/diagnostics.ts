"use client";

import { useEffect, useState } from "react";
import { loader } from "@monaco-editor/react";
import type { FileContents, TreeNode } from "./types";
import { languageForPath } from "./language";

/**
 * Real diagnostics, not a hand-rolled linter.
 *
 * Monaco *is* VS Code's editor and already runs the genuine TypeScript
 * language service. It publishes findings as **markers**, which is the same
 * model VS Code's `Diagnostic` API exposes — so the Problems panel just reads
 * them rather than inventing its own analysis.
 *
 * The one thing that needs doing on our side: Monaco only analyses files it
 * has a *model* for, and it only makes models for files opened in a tab. A
 * project-wide Problems list therefore has to create models for the whole
 * workspace, which also lets the language service resolve imports between
 * the user's files instead of treating each one in isolation.
 *
 * Note the instance has to come from `loader.init()`, NOT `import(
 * "monaco-editor")`. The editor is loaded from the self-hosted AMD bundle at
 * /monaco-editor/vs; importing the npm package instead gives a *second*,
 * unrelated Monaco whose marker registry the running editor never writes to,
 * so Problems would sit permanently empty with nothing obviously wrong.
 */

export type Severity = "error" | "warning" | "info" | "hint";

/** The subset of Monaco's IMarker this panel reads. */
interface MonacoMarker {
  resource: { scheme: string; path: string };
  message: string;
  severity: number;
  startLineNumber: number;
  startColumn: number;
  source?: string;
  code?: string | { value: string };
}

export interface Diagnostic {
  path: string;
  line: number;
  column: number;
  message: string;
  severity: Severity;
  /** Which service reported it, e.g. "ts". */
  source: string;
  /** Rule/error identifier, e.g. TS2304. */
  code?: string;
}

/** Monaco's MarkerSeverity is an enum: Hint 1, Info 2, Warning 4, Error 8. */
function toSeverity(value: number): Severity {
  if (value >= 8) return "error";
  if (value >= 4) return "warning";
  if (value >= 2) return "info";
  return "hint";
}

const ANALYSED = /\.(ts|tsx|js|jsx|mjs|cjs|json)$/i;

function collectFiles(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.type === "folder" ? collectFiles(node.children) : [node.path]
  );
}

/**
 * Keeps a Monaco model in existence for every analysable workspace file, so
 * diagnostics cover the project rather than only open tabs. Models are
 * updated in place (not recreated) when content changes — recreating them
 * would drop the language service's state and make the panel flicker.
 */
async function syncModels(tree: TreeNode[], files: FileContents): Promise<void> {
  const monaco = await loader.init();
  const wanted = collectFiles(tree).filter((path) => ANALYSED.test(path));
  const wantedSet = new Set(wanted);

  for (const model of monaco.editor.getModels()) {
    const path = model.uri.path.replace(/^\//, "");
    // Leave models Monaco owns for files we no longer track.
    if (!wantedSet.has(path)) {
      if (path.startsWith("workspace/")) model.dispose();
      continue;
    }
  }

  for (const path of wanted) {
    const uri = monaco.Uri.parse(`file:///${path}`);
    const existing = monaco.editor.getModel(uri);
    const content = files[path] ?? "";
    if (existing) {
      if (existing.getValue() !== content) existing.setValue(content);
      continue;
    }
    monaco.editor.createModel(content, languageForPath(path), uri);
  }
}

async function readMarkers(): Promise<Diagnostic[]> {
  const monaco = await loader.init();
  const markers = monaco.editor.getModelMarkers({}) as unknown as MonacoMarker[];

  return markers
    .filter((marker) => marker.resource.scheme === "file")
    .map((marker) => ({
      path: marker.resource.path.replace(/^\//, ""),
      line: marker.startLineNumber,
      column: marker.startColumn,
      message: marker.message,
      severity: toSeverity(marker.severity as unknown as number),
      source: marker.source ?? "ts",
      code:
        typeof marker.code === "string"
          ? marker.code
          : typeof marker.code === "object" && marker.code
            ? String(marker.code.value)
            : undefined,
    }))
    .sort(
      (a: Diagnostic, b: Diagnostic) =>
        a.path.localeCompare(b.path) ||
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        a.line - b.line
    );
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2, hint: 3 };

/**
 * Project-wide diagnostics. The language service reports asynchronously after
 * a model changes, so this re-reads on Monaco's own marker-change event
 * rather than guessing at a delay.
 */
export function useDiagnostics(tree: TreeNode[], files: FileContents): Diagnostic[] {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  useEffect(() => {
    let cancelled = false;
    let disposable: { dispose: () => void } | undefined;

    (async () => {
      const monaco = await loader.init();
      if (cancelled) return;

      await syncModels(tree, files);
      if (cancelled) return;

      const refresh = () => {
        void readMarkers().then((next) => {
          if (!cancelled) setDiagnostics(next);
        });
      };

      // Fires whenever the TS worker finishes analysing — the right signal.
      disposable = monaco.editor.onDidChangeMarkers(refresh);
      refresh();
    })();

    return () => {
      cancelled = true;
      disposable?.dispose();
    };
  }, [tree, files]);

  return diagnostics;
}
