"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Plus, Trash2, X } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import type { VfsBridge } from "@/lib/ide/vfs-bridge";
import { TerminalPanel } from "./TerminalPanel";

interface Session {
  id: number;
  name: string;
}

/**
 * Multiple independent terminal sessions, as a left-aligned tab strip
 * (matching the editor's own tabs) rather than a dropdown — each session
 * keeps its own scrollback and shell state (cwd), so you can e.g. `cd`
 * into a folder in one tab while running a script from another. All
 * share the SAME virtual filesystem (the same files the Explorer shows).
 */
export function TerminalGroup({
  theme,
  vfs,
  onPreview,
}: {
  theme: IdeTheme;
  vfs: VfsBridge;
  onPreview: (build: { html: string; title: string; root: string; objectUrls: string[] }) => void;
}) {
  const palette = idePalette(theme);
  const nextId = useRef(1);
  const [sessions, setSessions] = useState<Session[]>(() => [{ id: 1, name: "1: Terminal" }]);
  const [activeId, setActiveId] = useState<number | null>(1);

  const addTerminal = () => {
    nextId.current += 1;
    const id = nextId.current;
    setSessions((prev) => [...prev, { id, name: `${id}: Terminal` }]);
    setActiveId(id);
  };

  const closeTerminal = (id: number) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeId === id) {
        setActiveId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className={clsx("flex h-6 shrink-0 items-stretch justify-between border-b", palette.border)}>
        <div className="flex items-stretch overflow-x-auto">
          {sessions.map((s) => {
            const isActive = s.id === activeId;
            return (
              <div
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={clsx(
                  "group flex shrink-0 cursor-pointer items-center gap-1 border-r px-1.5 text-[11px]",
                  isActive && "rounded-t-lg",
                  palette.border,
                  isActive ? palette.tabActiveBg : palette.tabInactiveBg,
                  isActive ? palette.text : palette.textMuted
                )}
              >
                {s.name}
                <button
                  type="button"
                  className={clsx("flex h-3 w-3 items-center justify-center rounded-[3px]", palette.hover)}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTerminal(s.id);
                  }}
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            title="New Terminal"
            className={clsx("flex shrink-0 items-center rounded p-1", palette.hover)}
            onClick={addTerminal}
          >
            <Plus size={12} className={palette.textMuted} />
          </button>
        </div>

        {activeId !== null && (
          <div className="flex shrink-0 items-center px-1.5">
            <button
              type="button"
              title="Kill Terminal"
              className={clsx("rounded p-0.5", palette.hover)}
              onClick={() => closeTerminal(activeId)}
            >
              <Trash2 size={12} className={palette.textMuted} />
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {sessions.length === 0 ? (
          <div className={clsx("flex h-full flex-col items-center justify-center gap-2", palette.textMuted)}>
            <p className="text-xs">No active terminals.</p>
            <button
              type="button"
              onClick={addTerminal}
              className={clsx(
                "flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-xs",
                palette.hover,
                palette.text
              )}
            >
              <Plus size={13} />
              New Terminal
            </button>
          </div>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="h-full" style={{ display: s.id === activeId ? "block" : "none" }}>
              <TerminalPanel theme={theme} vfs={vfs} onPreview={onPreview} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
