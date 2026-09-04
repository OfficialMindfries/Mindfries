import { GitBranch, Bell, Moon, Sun, AlertCircle, AlertTriangle } from "lucide-react";
import type { Diagnostic } from "@/lib/ide/diagnostics";
import { STATUS_BAR_BG } from "@/lib/ide/palette";
import { languageForPath, displayLanguageName } from "@/lib/ide/language";
import type { IdeTheme } from "@/lib/ide/theme";

interface StatusBarProps {
  activePath: string | null;
  dirtyCount: number;
  diagnostics: Diagnostic[];
  theme: IdeTheme;
  onToggleTheme: () => void;
}

export function StatusBar({ activePath, dirtyCount, diagnostics, theme, onToggleTheme }: StatusBarProps) {
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const language = activePath ? displayLanguageName(languageForPath(activePath)) : null;

  return (
    <div
      className="flex h-[22px] shrink-0 items-center justify-between px-2 text-xs text-white"
      style={{ backgroundColor: STATUS_BAR_BG }}
    >
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <GitBranch size={13} />
          main
        </span>
        <span className="flex items-center gap-1" title={`${errors} errors, ${warnings} warnings`}>
          <AlertCircle size={13} />
          {errors}
          <AlertTriangle size={13} className="ml-1" />
          {warnings}
        </span>
        {dirtyCount > 0 && (
          <span>
            {dirtyCount} unsaved file{dirtyCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {language && <span>{language}</span>}
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        <span>LF</span>
        <Bell size={13} />
        <button
          type="button"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={onToggleTheme}
          className="flex items-center hover:opacity-80"
        >
          {theme === "dark" ? <Moon size={13} /> : <Sun size={13} />}
        </button>
      </div>
    </div>
  );
}
