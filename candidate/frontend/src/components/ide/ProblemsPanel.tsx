"use client";

import clsx from "clsx";
import { AlertCircle, AlertTriangle, Info, Lightbulb } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import type { Diagnostic, Severity } from "@/lib/ide/diagnostics";

/**
 * The Problems panel, grouped by file like VS Code's.
 *
 * Everything here comes from Monaco's real markers — the TypeScript language
 * service's own findings — so a row is a genuine diagnostic, not a heuristic.
 */

const ICONS: Record<Severity, typeof AlertCircle> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  hint: Lightbulb,
};

const COLORS: Record<Severity, string> = {
  error: "text-[#ff8a8a]",
  warning: "text-[#e0b341]",
  info: "text-[#4A7FA7]",
  hint: "text-[#B3CFE5]",
};

export function ProblemsPanel({
  theme,
  diagnostics,
  onOpen,
}: {
  theme: IdeTheme;
  diagnostics: Diagnostic[];
  onOpen: (path: string, line: number) => void;
}) {
  const palette = idePalette(theme);

  if (diagnostics.length === 0) {
    return (
      <div className={clsx("flex h-full items-center px-4 text-xs", palette.textMuted)}>
        No problems have been detected in the workspace.
      </div>
    );
  }

  const byFile = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const list = byFile.get(diagnostic.path) ?? [];
    list.push(diagnostic);
    byFile.set(diagnostic.path, list);
  }

  return (
    <div className="h-full overflow-auto py-1 text-xs">
      {[...byFile.entries()].map(([path, items]) => (
        <div key={path}>
          <div className={clsx("flex items-center gap-1.5 px-3 py-1", palette.textMuted)}>
            <span className={palette.text}>{path.split("/").pop()}</span>
            <span className="opacity-70">{path}</span>
            <span className="ml-1 rounded-full bg-[#4A7FA7]/25 px-1.5 text-[10px]">{items.length}</span>
          </div>
          {items.map((diagnostic, index) => {
            const Icon = ICONS[diagnostic.severity];
            return (
              <button
                key={`${path}:${diagnostic.line}:${diagnostic.column}:${index}`}
                type="button"
                onClick={() => onOpen(diagnostic.path, diagnostic.line)}
                className={clsx(
                  "flex w-full items-start gap-2 px-3 py-1 pl-7 text-left",
                  palette.hover
                )}
              >
                <Icon size={13} className={clsx("mt-0.5 shrink-0", COLORS[diagnostic.severity])} />
                <span className="min-w-0 flex-1">
                  <span className={palette.text}>{diagnostic.message}</span>{" "}
                  <span className={palette.textMuted}>
                    {diagnostic.source}
                    {diagnostic.code ? `(${diagnostic.code})` : ""} [Ln {diagnostic.line}, Col{" "}
                    {diagnostic.column}]
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
