"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Video, VideoOff, X } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";

/**
 * Webcam preview, for streaming alongside the workspace.
 *
 * The camera is only ever requested when the user presses Start — never on
 * mount, and never automatically after a reload. Prompting for someone's
 * camera because a panel happened to render would be the wrong default, so
 * the stream is explicitly opt-in and stopped whenever the panel unmounts.
 *
 * Nothing is recorded or sent anywhere: the stream is attached straight to a
 * local <video> element and released on stop.
 */
export function CameraPanel({
  theme,
  onClose,
}: {
  theme: IdeTheme;
  onClose: () => void;
}) {
  const palette = idePalette(theme);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = () => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
  };

  // Releasing the camera on unmount matters: without this the capture light
  // stays on after the panel is closed.
  useEffect(() => stop, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLive(true);
    } catch (err) {
      // Denied permission, no camera attached, or another app holding it —
      // report which rather than showing a blank rectangle.
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "camera permission denied"
          : name === "NotFoundError"
            ? "no camera found"
            : name === "NotReadableError"
              ? "camera is in use by another app"
              : err instanceof Error
                ? err.message
                : String(err)
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={clsx(
          "flex h-7 shrink-0 items-center justify-between border-b px-2 text-[11px]",
          palette.border,
          palette.panelBg
        )}
      >
        <span className={clsx("flex items-center gap-1", live ? palette.accent : palette.textMuted)}>
          <Video size={11} />
          Camera{live ? " — live" : ""}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            title={live ? "Stop camera" : "Start camera"}
            onClick={live ? stop : start}
            className={clsx("rounded-md p-1", palette.hover)}
          >
            {live ? <VideoOff size={12} /> : <Video size={12} />}
          </button>
          <button type="button" title="Close" onClick={onClose} className={clsx("rounded-md p-1", palette.hover)}>
            <X size={12} />
          </button>
        </span>
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        {/* 16:9 landscape, letterboxed rather than cropped. */}
        <video ref={videoRef} muted playsInline className="h-full w-full object-contain" />
        {!live && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
            <p className={clsx("text-[11px]", error ? "text-[#ff8a8a]" : "text-[#B3CFE5]/70")}>
              {error ?? "camera off"}
            </p>
            <button
              type="button"
              onClick={start}
              className="flex items-center gap-1.5 rounded-md bg-[#4A7FA7] px-2.5 py-1 text-[11px] font-medium text-[#F6FAFD] hover:opacity-90"
            >
              <Video size={12} />
              {error ? "Try again" : "Start camera"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
