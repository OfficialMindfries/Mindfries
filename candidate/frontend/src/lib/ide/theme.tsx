"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type IdeTheme = "dark" | "light";

interface ThemeContextValue {
  theme: IdeTheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "mindfries-ide-theme";

function readStoredOrSystemTheme(): IdeTheme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through to system preference
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function IdeThemeProvider({ children }: { children: ReactNode }) {
  // Server-rendered default; corrected from localStorage/system preference
  // right after mount, before paint, in the effect below.
  const [theme, setTheme] = useState<IdeTheme>("dark");

  useEffect(() => {
    // Reading localStorage/matchMedia — and therefore this setState — can
    // only happen after mount: both are unavailable during SSR, and using
    // them synchronously in render would produce a server/client mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readStoredOrSystemTheme());

    // IdeShell itself only covers h-dvh of viewport height — anything a
    // fraction of a pixel taller (rounding, a mobile URL bar collapsing)
    // would show the page's own white background peeking through behind
    // it. Paint the page itself to match so dark mode is dark everywhere,
    // and restore the original color on unmount (leaving /ide).
    const previousBodyBg = document.body.style.backgroundColor;
    const previousHtmlBg = document.documentElement.style.backgroundColor;
    return () => {
      document.body.style.backgroundColor = previousBodyBg;
      document.documentElement.style.backgroundColor = previousHtmlBg;
    };
  }, []);

  useEffect(() => {
    const bg = theme === "dark" ? "#1e1e1e" : "#ffffff";
    document.body.style.backgroundColor = bg;
    document.documentElement.style.backgroundColor = bg;
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore — theme just won't persist across reloads
      }
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useIdeTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useIdeTheme must be used within an IdeThemeProvider");
  return ctx;
}
