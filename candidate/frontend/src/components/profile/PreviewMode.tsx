"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Whether the page is showing itself the way the person editing it sees it
 * (edit buttons, Connect prompts for platforms not yet linked, Choose file)
 * or the way a hiring team would (none of that — just what's actually there).
 *
 * A real toggle, not decoration: a hiring team never sees a "Connect your
 * GitHub" prompt for a platform that isn't linked, because there's nothing
 * to show them — so preview mode doesn't grey those out, it removes them,
 * the same as what a hiring team's own view would render.
 */
const PreviewModeContext = createContext(false);

export const usePreviewMode = () => useContext(PreviewModeContext);

export function PreviewModeProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState(false);

  return (
    <PreviewModeContext.Provider value={preview}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-[#0A1931]">Profile</h1>
          <p className="mt-1.5 text-sm text-[#4A7FA7]">
            What hiring teams see alongside the evidence from your sessions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          className="btn-wipe inline-flex h-9 shrink-0 items-center gap-2 px-4 text-[13px] font-semibold"
          style={
            preview
              ? ({ "--btn-bg": "#1A3D63", "--btn-fg": "#F6FAFD", "--btn-fill": "#0A1931", "--btn-fg-hover": "#FFFFFF" } as React.CSSProperties)
              : ({ "--btn-bg": "#FFFFFF", "--btn-fg": "#1A3D63", "--btn-fill": "#1A3D63", "--btn-fg-hover": "#F6FAFD" } as React.CSSProperties)
          }
        >
          {preview ? <EyeOff size={14} /> : <Eye size={14} />}
          {preview ? "Editing view" : "View as others see"}
        </button>
      </div>

      {preview && (
        <p className="mt-3 rounded-xl bg-[#0A1931] px-4 py-2.5 text-[12.5px] text-[#B3CFE5]">
          This is what a hiring team sees — nothing you haven&apos;t added, no edit controls.
        </p>
      )}

      {children}
    </PreviewModeContext.Provider>
  );
}
