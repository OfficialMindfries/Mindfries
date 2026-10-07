"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Clock, Send, AlertTriangle } from "lucide-react";
import { idePalette, STATUS_BAR_BG } from "@/lib/ide/palette";
import type { IdeTheme } from "@/lib/ide/theme";

interface HeaderPanelProps {
  theme: IdeTheme;
  assessmentName: string;
  /** Seconds left on the session's clock. Undefined when nothing is being timed — the timer is hidden rather than counting down an invented duration. */
  durationSeconds?: number;
  onSubmit: () => void;
  /** Called once, when a timed session reaches zero. */
  onExpire?: () => void;
}

/**
 * Top-level header bar for the assessment workspace (PRD §1.6).
 *
 * Shows the assessment name on the left, a live countdown timer in the
 * center, and a Submit button on the right. The timer starts from what the
 * backend says is left on the session and ticks locally from there.
 */
export function HeaderPanel({ theme, assessmentName, durationSeconds, onSubmit, onExpire }: HeaderPanelProps) {
  const palette = idePalette(theme);
  const [remaining, setRemaining] = useState(durationSeconds ?? 0);

  useEffect(() => {
    if (durationSeconds === undefined || remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [remaining, durationSeconds]);

  // Fires once when the clock runs out — including straight away, for a
  // workspace opened after its session's time had already gone.
  const expired = durationSeconds !== undefined && remaining <= 0;
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });
  useEffect(() => {
    if (expired) onExpireRef.current?.();
  }, [expired]);

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  const formatted = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const isLow = remaining <= 300; // 5 minutes or less
  const isCritical = remaining <= 60; // 1 minute or less

  return (
    <div
      className={clsx(
        "flex h-10 shrink-0 items-center justify-between rounded-xl border px-4",
        palette.border,
        palette.panelBg,
        palette.text
      )}
    >
      {/* Left: Assessment name */}
      <div className="flex items-center gap-2 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG */}
        <img src="/mindfries-logo.svg" alt="" width={20} height={20} />
        <span className="truncate text-sm font-semibold">{assessmentName}</span>
      </div>

      {/* Center: Timer */}
      {durationSeconds !== undefined && (
      <div
        className={clsx("flex items-center gap-1.5 rounded-lg px-3 py-1 font-mono text-sm", {
          "bg-[#4A7FA7]/20 text-[#B3CFE5]": !isLow && theme === "dark",
          "bg-[#4A7FA7]/10 text-[#4A7FA7]": !isLow && theme === "light",
          "bg-[#E06C75]/15 text-[#E06C75]": isLow && !isCritical,
          "bg-[#AD2934]/20 text-[#E06C75] animate-pulse": isCritical,
        })}
      >
        {isLow ? <AlertTriangle size={14} /> : <Clock size={14} />}
        <span>{formatted}</span>
      </div>
      )}

      {/* Right: Submit button */}
      <button
        type="button"
        onClick={onSubmit}
        className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: STATUS_BAR_BG }}
      >
        <Send size={14} />
        Submit
      </button>
    </div>
  );
}

/**
 * Modal confirmation dialog shown when the candidate clicks Submit.
 * Gives them a final chance to go back before their work is submitted.
 */
export function SubmitConfirmDialog({
  theme,
  onCancel,
  onConfirm,
  pending,
  error,
  timeUp,
}: {
  theme: IdeTheme;
  onCancel: () => void;
  onConfirm: () => void;
  /** The session ran out of time: the work is being submitted as it stands, and there is no going back to it. */
  timeUp?: boolean;
  /** True while a real submit call to the backend is in flight — disables both buttons so a slow request can't be fired twice. */
  pending?: boolean;
  /** Set when a real submit attempt failed — shown instead of silently reopening the workspace as if nothing happened. */
  error?: string;
}) {
  const palette = idePalette(theme);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-dialog-title"
        className={clsx(
          "w-full max-w-md overflow-hidden rounded-xl border shadow-2xl",
          palette.border,
          palette.appBg,
          palette.text
        )}
      >
        <div className={clsx("flex items-center gap-2 border-b px-4 py-3", palette.border)}>
          <Send size={16} className={palette.accent} />
          <h2 id="submit-dialog-title" className="text-sm font-semibold">
            {timeUp ? "Time is up" : "Submit your work?"}
          </h2>
        </div>

        <div className="px-4 py-3 text-sm">
          {timeUp ? (
            <p className={palette.textMuted}>
              Your session has reached its time limit. Your work is being submitted exactly as it
              stands — code, activity and interview answers.
            </p>
          ) : (
            <>
              <p className={palette.textMuted}>
                Once you submit, you will not be able to make any further changes. Your code, terminal
                history, and all activity will be sent for evaluation.
              </p>
              <p className={clsx("mt-2", palette.textMuted)}>
                Make sure you have saved all your files and are happy with your solution before
                proceeding.
              </p>
            </>
          )}
          {error && (
            <p className="mt-3 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className={clsx("flex justify-end gap-2 border-t px-4 py-3", palette.border)}>
          {!timeUp && (
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className={clsx("rounded-md px-3 py-1.5 text-xs disabled:opacity-50", palette.hover, palette.textMuted)}
            >
              Go back
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: STATUS_BAR_BG }}
          >
            <Send size={13} />
            {pending ? "Submitting…" : timeUp ? "Try again" : "Confirm & submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
