"use client";

import clsx from "clsx";
import { Video, ShieldAlert } from "lucide-react";
import { idePalette } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";
import type { ProctorCamera } from "@/lib/ide/proctor-camera";
import { enterFullscreen } from "@/lib/ide/fullscreen";

/**
 * Blocks the workspace until the proctoring camera is live.
 *
 * It states plainly, before the permission prompt, that the session is
 * recorded-on-camera and that the camera stays on throughout. Springing that
 * on someone after the fact would be the wrong way to build this.
 *
 * The start button also takes the workspace fullscreen. That isn't an
 * afterthought about where to put it: `requestFullscreen()` needs an active
 * user gesture, so it can't run on page load, and this click is the one
 * gesture every session is guaranteed to pass through. See lib/ide/fullscreen.ts.
 */
export function ProctorGate({
  theme,
  camera,
}: {
  theme: IdeTheme;
  camera: ProctorCamera;
}) {
  const palette = idePalette(theme);
  if (camera.status === "live") return null;

  const interrupted = camera.status === "ended";
  const busy = camera.status === "requesting";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          "w-full max-w-md overflow-hidden rounded-xl border shadow-2xl",
          palette.border,
          palette.appBg,
          palette.text
        )}
      >
        <div className={clsx("flex items-center gap-2 border-b px-4 py-3", palette.border)}>
          {interrupted ? (
            <ShieldAlert size={16} className="text-[#ff8a8a]" />
          ) : (
            <Video size={16} className={palette.accent} />
          )}
          <h2 className="text-sm font-semibold">
            {interrupted ? "Session paused — camera stopped" : "Camera required"}
          </h2>
        </div>

        <div className="space-y-2 px-4 py-3 text-sm">
          <p className={palette.textMuted}>
            This is a proctored session. Your camera must stay on the whole time you&apos;re using
            the workspace, and your video is shown on screen so you can see exactly what&apos;s
            being captured.
          </p>
          {camera.message && (
            <p className={clsx("text-xs", interrupted ? "text-[#ff8a8a]" : palette.textMuted)}>
              {camera.message}
            </p>
          )}
          <p className={clsx("text-xs", palette.textMuted)}>
            The workspace stays locked until the camera is running.
          </p>
        </div>

        <div className={clsx("flex justify-end border-t px-4 py-3", palette.border)}>
          <button
            type="button"
            onClick={() => {
              // Synchronously first: this click is the user gesture that
              // makes fullscreen legal, and awaiting the camera permission
              // would consume the activation before we got to ask.
              void enterFullscreen();
              void camera.request();
            }}
            disabled={busy}
            className={clsx(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              busy
                ? clsx(palette.textMuted, "opacity-60")
                : "bg-[#4A7FA7] text-[#F6FAFD] hover:opacity-90"
            )}
          >
            <Video size={13} />
            {busy ? "Waiting for camera…" : interrupted ? "Reconnect camera" : "Enable camera & start"}
          </button>
        </div>
      </div>
    </div>
  );
}
