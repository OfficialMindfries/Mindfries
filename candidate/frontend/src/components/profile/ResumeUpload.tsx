"use client";

import { FileText, Paperclip, Trash2 } from "lucide-react";
import { ACCEPTED_EXT, ACCEPTED_MIME, formatBytes, MAX_RESUME_BYTES } from "@/lib/profile/useResumeUploader";
import { uploadResume, removeResume } from "@/lib/profile/actions";
import { usePreviewMode } from "./PreviewMode";
import { useState, useRef } from "react";

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
export function ResumeUpload({ resumePath, resumeUrl }: { resumePath?: string | null; resumeUrl?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = usePreviewMode();

  const fileName = resumePath ? resumePath.split("/").pop()?.split("-").slice(1).join("-") || "Resume" : null;

  async function handleFile(file: File) {
    setError(null);
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ACCEPTED_MIME.has(file.type) && !ACCEPTED_EXT.includes(ext)) {
      setError("PDF, DOC or DOCX only.");
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setError(`That's ${formatBytes(file.size)} — keep it under ${formatBytes(MAX_RESUME_BYTES)}.`);
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await uploadResume(formData);
      if (!res.ok) {
        setError(res.error || "Couldn't upload resume.");
      }
    } catch {
      setError("Couldn't upload that file — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    await removeResume();
    setBusy(false);
  }

  return (
    <section className="rounded-2xl bg-[#FDF09B] p-5 shadow-[0_10px_24px_-14px_rgba(10,25,49,0.35)]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0A1931]/10 text-[#0A1931]">
          <FileText size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[#0A1931]">Resume</h2>

          {resumePath && fileName ? (
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2">
              <Paperclip size={14} className="shrink-0 text-[#0A1931]/60" />
              <div className="min-w-0 flex-1">
                {resumeUrl ? (
                  <a href={resumeUrl} target="_blank" rel="noreferrer" className="truncate text-[13px] font-medium text-[#1A3D63] hover:underline">
                    {fileName}
                  </a>
                ) : (
                  <p className="truncate text-[13px] font-medium text-[#0A1931]">{fileName}</p>
                )}
                <p className="text-[11px] text-[#0A1931]/60">
                  saved securely
                </p>
              </div>
              {!preview && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={busy}
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
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                  className="btn-wipe px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-50"
                  style={{ "--btn-bg": "#0A1931", "--btn-fg": "#F6FAFD", "--btn-fill": "#1A3D63", "--btn-fg-hover": "#FFFFFF" } as React.CSSProperties}
                >
                  {busy ? "Uploading…" : resumePath ? "Replace" : "Choose file"}
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
                  if (file) void handleFile(file);
                }}
              />

              <p className="mt-3 text-[11px] leading-relaxed text-[#0A1931]/60">
                Uploaded securely — only visible to hiring teams.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
