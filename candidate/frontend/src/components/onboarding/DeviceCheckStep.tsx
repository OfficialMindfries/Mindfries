"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, RefreshCcw } from "lucide-react";
import clsx from "clsx";

type CheckStatus = "idle" | "requesting" | "ok" | "denied" | "unavailable";

interface DeviceCheckStepProps {
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Step 2: Device & Camera Check.
 *
 * Grants camera permission early — before the clock starts — so the candidate
 * isn't surprised by a browser prompt inside the workspace. Shows a live
 * preview so they can confirm the camera is actually pointing at them.
 *
 * If permission is already granted (e.g. returning to this step), the preview
 * auto-starts. Errors are shown with plain human language, not browser error codes.
 */
export function DeviceCheckStep({ onBack, onContinue }: DeviceCheckStepProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CheckStatus>("idle");

  const startCamera = async () => {
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStatus("ok");
    } catch (err: unknown) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setStatus("denied");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setStatus("unavailable");
        } else {
          setStatus("denied");
        }
      } else {
        setStatus("denied");
      }
    }
  };

  // Auto-start check on mount
  useEffect(() => {
    void startCamera();
    return () => {
      // Clean up stream when leaving this step
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isOk = status === "ok";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#4A7FA7]">Step 2 — Device Check</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#0A1931]">Camera check</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#4A7FA7]">
          The workspace requires your camera throughout the session. Let&apos;s make sure it&apos;s working before the timer starts.
        </p>
      </div>

      {/* Camera preview card */}
      <div className="overflow-hidden rounded-2xl border border-[#B3CFE5] bg-[#0A1931]">
        <div className="relative aspect-video w-full bg-[#0A1931]">
          {/* Live preview */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={clsx(
              "h-full w-full object-cover transition-opacity duration-500",
              isOk ? "opacity-100" : "opacity-0"
            )}
          />

          {/* Overlay for non-ok states */}
          {!isOk && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
              {status === "idle" || status === "requesting" ? (
                <>
                  <Camera size={32} className="text-[#4A7FA7] animate-pulse" />
                  <p className="text-sm text-[#B3CFE5]">
                    {status === "idle" ? "Starting camera…" : "Waiting for permission…"}
                  </p>
                </>
              ) : status === "denied" ? (
                <>
                  <AlertTriangle size={32} className="text-[#E06C75]" />
                  <p className="text-sm text-[#F6FAFD]">Camera access was denied</p>
                  <p className="text-xs text-[#B3CFE5]">
                    Allow camera access in your browser settings, then try again.
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangle size={32} className="text-[#E06C75]" />
                  <p className="text-sm text-[#F6FAFD]">No camera found</p>
                  <p className="text-xs text-[#B3CFE5]">
                    Connect a camera to continue. If you&apos;re on a laptop, check that the camera is not covered.
                  </p>
                </>
              )}
            </div>
          )}

          {/* Status badge */}
          {isOk && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3E8E6E]" />
              Camera live
            </div>
          )}
        </div>

        {/* Footer of the card */}
        <div className="flex items-center justify-between border-t border-[#1A3D63] px-4 py-3">
          <div className="flex items-center gap-2">
            {isOk ? (
              <>
                <CheckCircle2 size={16} className="text-[#3E8E6E]" />
                <span className="text-xs font-medium text-[#B3CFE5]">Camera ready</span>
              </>
            ) : (
              <>
                <Camera size={16} className="text-[#B3CFE5]/60" />
                <span className="text-xs text-[#B3CFE5]/60">
                  {status === "requesting" ? "Requesting…" : "Camera not detected"}
                </span>
              </>
            )}
          </div>
          {(status === "denied" || status === "unavailable") && (
            <button
              type="button"
              onClick={() => void startCamera()}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#B3CFE5] transition-colors hover:bg-[#1A3D63]"
            >
              <RefreshCcw size={13} />
              Try again
            </button>
          )}
        </div>
      </div>

      {/* Checklist */}
      <div className="rounded-2xl border border-[#B3CFE5] bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#4A7FA7]">Requirements</p>
        <ul className="space-y-2">
          {[
            { label: "Camera visible and working", met: isOk },
            { label: "Browser has camera permission", met: isOk },
            { label: "You are visible in the preview", met: isOk },
          ].map((item) => (
            <li key={item.label} className="flex items-center gap-2.5 text-xs">
              {item.met ? (
                <CheckCircle2 size={15} className="shrink-0 text-[#3E8E6E]" />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#B3CFE5]" />
              )}
              <span className={item.met ? "text-[#0A1931]" : "text-[#4A7FA7]"}>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-[#4A7FA7] transition-colors hover:bg-[#B3CFE5]/30 hover:text-[#1A3D63]"
        >
          <ArrowLeft size={15} />
          Back
        </button>
        <button
          id="device-check-continue"
          type="button"
          disabled={!isOk}
          onClick={onContinue}
          className="flex items-center gap-2 rounded-lg bg-[#1A3D63] px-5 py-2.5 text-sm font-medium text-[#F6FAFD] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
