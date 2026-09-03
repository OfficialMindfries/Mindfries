"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { Video } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";

/**
 * The proctoring camera preview.
 *
 * It has no start, stop or close control by design: the session requires the
 * camera to stay on, so offering an off switch here would only ever be a
 * switch that also locks the workspace. Stopping means ending the session
 * (or revoking permission in the browser, which the gate then catches).
 *
 * The stream is owned by `useProctorCamera` above this component — this only
 * displays it, so the feed survives layout changes and can't be detached by
 * re-rendering.
 */
export function CameraPanel({ theme, stream }: { theme: IdeTheme; stream: MediaStream | null }) {
  const palette = idePalette(theme);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
  }, [stream]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={clsx(
          "flex h-7 shrink-0 items-center gap-1 border-b px-2 text-[11px]",
          palette.border,
          palette.panelBg
        )}
      >
        <Video size={11} className={palette.accent} />
        <span className={palette.text}>Camera</span>
        {/* A steady, always-present indicator: no ambiguity about whether
            the session is being watched. */}
        <span className="ml-auto flex items-center gap-1 text-[#ff8a8a]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#ff8a8a]" />
          recording
        </span>
      </div>

      <div className="min-h-0 flex-1 bg-black">
        {/* Landscape, letterboxed rather than cropped. */}
        <video ref={videoRef} muted playsInline className="h-full w-full object-contain" />
      </div>
    </div>
  );
}
