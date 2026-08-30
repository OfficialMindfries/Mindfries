"use client";

import { useEffect, useRef } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";
import type { FitAddon as XFitAddon } from "@xterm/addon-fit";
import type { IdeTheme } from "@/lib/ide/theme";
import type { VfsBridge } from "@/lib/ide/vfs-bridge";
import { attachVfsShell } from "./vfs-shell";

const xtermTheme = {
  dark: {
    background: "#1e1e1e",
    foreground: "#cccccc",
    cursor: "#cccccc",
  },
  light: {
    background: "#ffffff",
    foreground: "#1e1e1e",
    cursor: "#1e1e1e",
  },
} as const;

const MIN_COLS = 10;
const MIN_ROWS = 3;

/**
 * FitAddon.fit() can measure a bogus (near-zero) cell size if called before
 * xterm's own renderer has completed its first real paint — this has been a
 * long-standing xterm.js/React integration footgun. Rather than chase the
 * exact timing, validate the proposed size and simply ignore it if it's
 * nonsensical; a later, valid resize (ResizeObserver, or the next fit) will
 * correct it.
 */
function safeFit(fit: XFitAddon) {
  const proposed = fit.proposeDimensions();
  if (!proposed || proposed.cols < MIN_COLS || proposed.rows < MIN_ROWS) return;
  fit.fit();
}

export function TerminalPanel({ theme, vfs }: { theme: IdeTheme; vfs: VfsBridge }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<XFitAddon | null>(null);

  // Create the terminal once on mount.
  useEffect(() => {
    let cancelled = false;
    let detachShell: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let rafHandle: number | undefined;

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      const container = containerRef.current;
      if (cancelled || !container) return;

      const term = new Terminal({
        cols: 80,
        rows: 24,
        fontSize: 13,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        cursorBlink: true,
        convertEol: true,
        theme: xtermTheme[theme],
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container);

      termRef.current = term;
      fitRef.current = fit;

      // Wait a full layout+paint cycle (double rAF) before the first fit —
      // a single rAF can still land before xterm's renderer has measured a
      // real character cell.
      rafHandle = requestAnimationFrame(() => {
        rafHandle = requestAnimationFrame(() => {
          if (cancelled) return;
          safeFit(fit);
          // vfs's methods read live state via IdeShell's own internal ref
          // and stable setState setters, so capturing this render's `vfs`
          // instance here (the effect only runs once, on mount) behaves
          // identically to a "live" reference — no staleness concern.
          detachShell = attachVfsShell(term, vfs);
        });
      });

      let pending = false;
      resizeObserver = new ResizeObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          safeFit(fit);
        });
      });
      resizeObserver.observe(container);
    })();

    return () => {
      cancelled = true;
      if (rafHandle !== undefined) cancelAnimationFrame(rafHandle);
      resizeObserver?.disconnect();
      detachShell?.();
      termRef.current?.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- terminal is created once; theme changes are handled below
  }, []);

  // Update colors in place when the theme toggles, without recreating the terminal.
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = xtermTheme[theme];
    }
  }, [theme]);

  return <div ref={containerRef} className="h-full min-h-0 w-full p-1" />;
}
