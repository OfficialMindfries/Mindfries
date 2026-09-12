"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Open/close state for a dropdown panel (the bell, the account menu): closes
 * on Escape and on a click outside the trigger+panel, which every dropdown
 * in this app needs and none should each reimplement slightly differently.
 */
export function useDismissablePanel<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, ref };
}
