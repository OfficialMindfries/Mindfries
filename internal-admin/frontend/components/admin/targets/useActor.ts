"use client";

import { useSyncExternalStore } from "react";

// ── Who's using the panel ───────────────────────────────────────────────────
// There's no login yet, so there's no signed-in user to put on a touch. Until
// there is, the panel asks for a name once and remembers it in this browser.
// It's a label for the timeline — who did what — not an identity, and anyone
// can type any name; that's the gap a real login will close.

const KEY = "mindfries.admin.actor";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The remembered name. `useSyncExternalStore` with an empty server snapshot, so
 * the server render and the first client render agree (no hydration mismatch),
 * and the stored name appears right after.
 */
export function useActor(): [string, (name: string) => void] {
  const name = useSyncExternalStore(subscribe, read, () => "");
  const set = (next: string) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: the name just won't be remembered next time.
    }
    listeners.forEach((l) => l());
  };
  return [name, set];
}
