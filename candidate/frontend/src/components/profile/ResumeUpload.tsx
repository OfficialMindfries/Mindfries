"use client";

import { FileText, Paperclip, Trash2 } from "lucide-react";
import { ACCEPTED_EXT, ACCEPTED_MIME, formatBytes, formatDate, MAX_RESUME_BYTES, useResumeUploader } from "@/lib/profile/useResumeUploader";
import { usePreviewMode } from "./PreviewMode";

/**
 * A real file picker, honestly scoped: the file is read and held in this
 * browser's localStorage, not sent anywhere — there's no server to send it
 * to yet. Saying "uploaded" would claim more than that, so the copy says
 * "saved in this browser" throughout, the same distinction useActor.ts and
 * the admin's file-store backend already draw elsewhere in this codebase.
 *
 * Flat, not tilted: this card and its two neighbours borrow StickyNote's
 * colours, not the tilt-and-tape treatment — that motif is reserved for the
 * dashboard's wall of things happening to you (see StickyNote's own doc
 * comment), and a profile's sidebar reads as reference material, not mail.
 */
export function ResumeUpload() {
  const { resume, inputRef, pick, onFile, error, busy, removeResume } = useResumeUploader();
  const preview = usePreviewMode();

  return (
    <section className="rounded-2xl bg-[#FDF09B] p-5 shadow-[0_10px_24px_-14px_rgba(10,25,49,0.35)]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0A1931]/10 text-[#0A1931]">
          <FileText size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[#0A1931]">Resume</h2>

          {resume ? (
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2">
              <Paperclip size={14} className="shrink-0 text-[#0A1931]/60" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[#0A1931]">{resume.fileName}</p>
                <p className="text-[11px] text-[#0A1931]/60">
                  {formatBytes(resume.sizeBytes)} · saved {formatDate(resume.savedAt)}
                </p>
              </div>
              {!preview && (
                <button
                  type="button"
                  onClick={removeResume}
                  aria-label="Remove resume"
                  className="shrink-0 rounded-lg p-1.5 text-[#0A1931]/60 transition-colors hover:bg-white/60 hover:text-[#a6203c]"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ) : preview ? (
            <p className="mt-1 text-[13px] text-[#0A1931]/70">No resume added yet.</p>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed text-[#0A1931]/70">
              PDF, DOC or DOCX, up to {formatBytes(MAX_RESUME_BYTES)}.
            </p>
          )}

          {!preview && (
            <>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={pick}
                  disabled={busy}
                  className="btn-wipe px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-50"
                  style={{ "--btn-bg": "#0A1931", "--btn-fg": "#F6FAFD", "--btn-fill": "#1A3D63", "--btn-fg-hover": "#FFFFFF" } as React.CSSProperties}
                >
                  {busy ? "Reading…" : resume ? "Replace" : "Choose file"}
                </button>
                {error && <span className="text-[12px] text-[#a6203c]">{error}</span>}
              </div>

              <input
                ref={inputRef}
                type="file"
                accept={[...ACCEPTED_EXT, ...ACCEPTED_MIME].join(",")}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // so choosing the same file twice still fires onChange
                  if (file) void onFile(file);
                }}
              />

              <p className="mt-3 text-[11px] leading-relaxed text-[#0A1931]/60">
                Saved in this browser only — not yet sent to hiring teams.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
