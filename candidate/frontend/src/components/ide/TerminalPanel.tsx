"use client";

import { useEffect, useRef } from "react";
import type { Terminal as XTerm } from "@xterm/xterm";
import type { FitAddon as XFitAddon } from "@xterm/addon-fit";
import type { IdeTheme } from "@/lib/ide/theme";
import type { VfsBridge } from "@/lib/ide/vfs-bridge";
import { attachVfsShell } from "./vfs-shell";

const xtermTheme = {
  dark: {
    background: "#0A1931",
    foreground: "#F6FAFD",
    cursor: "#4A7FA7",
  },
  light: {
    background: "#F6FAFD",
    foreground: "#0A1931",
    cursor: "#4A7FA7",
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

/**
 * xterm's bundled CSS hardcodes `.xterm-viewport { background-color: #000 }`,
 * and the DOM renderer (unlike the canvas renderer) never overrides that
 * class rule with an inline style from `theme.background` — the option is
 * simply ignored for this element. It went unnoticed while the dark theme's
 * background (#0A1931-ish) was close enough to black to look right by
 * accident; it's glaring once the light theme's near-white background needs
 * to show instead. Set it directly, since an inline style beats the class rule.
 */
function paintViewport(container: HTMLElement, background: string) {
  const viewport = container.querySelector<HTMLElement>(".xterm-viewport");
  if (viewport) viewport.style.backgroundColor = background;
}

export function TerminalPanel({
  theme,
  vfs,
  onPreview,
}: {
  theme: IdeTheme;
  vfs: VfsBridge;
  onPreview: (html: string, title: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<XFitAddon | null>(null);

  // The shell is attached once, on mount, so it can't close over the current
  // prop — a ref keeps the callback live across re-renders. Assigned in an
  // effect rather than during render, which React forbids.
  const onPreviewRef = useRef(onPreview);
  useEffect(() => {
    onPreviewRef.current = onPreview;
  }, [onPreview]);

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
        // A thin vertical bar ("|"), not the default solid block, per feedback
        // that the cursor read as too heavy — cursorWidth only applies to "bar".
        cursorStyle: "bar",
        cursorWidth: 1,
        convertEol: true,
        theme: xtermTheme[theme],
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(container);
      paintViewport(container, xtermTheme[theme].background);

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
          detachShell = attachVfsShell(term, vfs, (html, title) =>
            onPreviewRef.current(html, title)
          );
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
    if (containerRef.current) {
      paintViewport(containerRef.current, xtermTheme[theme].background);
    }
  }, [theme]);

  return <div ref={containerRef} className="h-full min-h-0 w-full p-1" />;
}
