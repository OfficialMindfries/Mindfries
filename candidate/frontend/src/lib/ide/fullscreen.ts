"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Fullscreen for the workspace.
 *
 * ## Why this can't fire on page load
 *
 * `requestFullscreen()` only works while the browser considers a user
 * gesture active. Calling it from an effect on mount throws
 * "API can only be initiated by a user gesture" — every browser enforces it,
 * and no flag or setting turns it off. It's the same class of restriction as
 * the close prompt: a page doesn't get to take over the screen unasked.
 *
 * So the request rides on the gesture the session already requires. Nobody
 * reaches the workspace without pressing "Enable camera & start" on the
 * proctoring gate, so hooking fullscreen to that click makes it automatic in
 * practice — open `/ide`, press the one button there is, and you're
 * fullscreen — without pretending the restriction isn't there.
 *
 * The call must happen *synchronously* in the click handler, before any
 * `await`: user activation is consumed by the first await, so requesting
 * fullscreen after the camera permission resolves would be too late.
 *
 * Failure is deliberately quiet. Fullscreen can be refused outright — an
 * embedded frame without `allow="fullscreen"`, an unsupported browser, a
 * managed device — and none of that should stop a session from starting.
 */

interface FullscreenCapableElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenCapableDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

function isFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const doc = document as FullscreenCapableDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/** Best-effort: resolves whether or not the browser allowed it. */
export async function enterFullscreen(): Promise<void> {
  if (typeof document === "undefined" || isFullscreen()) return;
  const element = document.documentElement as FullscreenCapableElement;
  try {
    if (element.requestFullscreen) await element.requestFullscreen({ navigationUI: "hide" });
    else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
  } catch {
    // Refused (no activation, blocked by policy, unsupported). The session
    // works windowed; nothing here is worth interrupting a candidate for.
  }
}

export async function exitFullscreen(): Promise<void> {
  if (typeof document === "undefined" || !isFullscreen()) return;
  const doc = document as FullscreenCapableDocument;
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
  } catch {
    // Same reasoning as above.
  }
}

/**
 * Tracks fullscreen state, which has to come from the `fullscreenchange`
 * event rather than from whatever we last asked for: Esc and F11 leave
 * fullscreen without going through this module at all, and a toggle that
 * didn't notice would end up inverted.
 */
export function useFullscreen(): { active: boolean; toggle: () => void } {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(isFullscreen());
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggle = useCallback(() => {
    void (isFullscreen() ? exitFullscreen() : enterFullscreen());
  }, []);

  return { active, toggle };
}
