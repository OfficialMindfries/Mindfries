"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The camera for a proctored session.
 *
 * The workspace is unusable unless a camera stream is live, so the stream is
 * owned here (above the panel that displays it) and the IDE gates on its
 * status.
 *
 * Two things this deliberately does NOT try to do:
 *
 *  - hide that the camera is on. The candidate is told before the permission
 *    prompt and can see themselves for the whole session.
 *  - fight the browser. Permission can always be revoked from site settings
 *    or the tab's camera control, and no page can prevent that. When it
 *    happens the track fires `ended`, and the IDE locks rather than
 *    pretending to still be monitoring.
 */

export type ProctorStatus =
  | "idle"
  | "requesting"
  | "live"
  /** Permission refused at the prompt or blocked in site settings. */
  | "denied"
  /** No camera attached, or another application is holding it. */
  | "unavailable"
  /** Was live, then the track stopped — revoked, unplugged, or slept. */
  | "ended";

export interface ProctorCamera {
  status: ProctorStatus;
  stream: MediaStream | null;
  /** Details for the lock screen when something went wrong. */
  message: string | null;
  request: () => Promise<void>;
  /** Releases the device deliberately, for when the candidate ends the session. */
  stop: () => void;
}

export function useProctorCamera(): ProctorCamera {
  const [status, setStatus] = useState<ProctorStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Release the device if the workspace unmounts, so the capture light
  // doesn't stay on after the tab navigates away.
  useEffect(() => {
    return () => {
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
    };
  }, []);

  const request = useCallback(async () => {
    setStatus("requesting");
    setMessage(null);
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = next;
      setStream(next);
      setStatus("live");

      // The only reliable signal that access went away mid-session: revoking
      // permission, unplugging the camera, or the OS suspending it all end
      // the track. Polling permissions would be slower and less certain.
      for (const track of next.getVideoTracks()) {
        track.addEventListener("ended", () => {
          streamRef.current = null;
          setStream(null);
          setStatus("ended");
          setMessage("The camera stopped. It may have been unplugged, or access revoked.");
        });
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        setStatus("denied");
        setMessage(
          "Camera access was blocked. Allow it for this site in your browser's address bar, then try again."
        );
      } else if (name === "NotFoundError") {
        setStatus("unavailable");
        setMessage("No camera was found. Connect one and try again.");
      } else if (name === "NotReadableError") {
        setStatus("unavailable");
        setMessage("The camera is being used by another application. Close it and try again.");
      } else {
        setStatus("unavailable");
        setMessage(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  /**
   * Deliberate release, distinct from the `ended` status: that one means the
   * camera went away mid-session and the workspace must lock. This one is the
   * candidate finishing, so it lands on `idle` and the capture light goes out
   * at the moment they're told the session is over.
   */
  const stop = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    setStream(null);
    setStatus("idle");
    setMessage(null);
  }, []);

  return { status, stream, message, request, stop };
}
