"use client";

import { FileText, Paperclip, Trash2 } from "lucide-react";
import { ACCEPTED_EXT, ACCEPTED_MIME, formatBytes, MAX_RESUME_BYTES } from "@/lib/profile/useResumeUploader";
import { fillProfileFromResume, uploadResume, removeResume } from "@/lib/profile/actions";
import type { ResumeFields } from "@/lib/profile/resume-fields";
import { usePreviewMode } from "./PreviewMode";
import { useState, useRef } from "react";

/**
 * A real file picker: the file goes to the private `resumes` bucket, and
 * its text is read in this browser first (lib/profile/resumeParse.ts) and
 * sent along, so the server can keep what the resume says — the skills it
 * names, a headline, a summary — beside the file. A resume that can't be
 * read (a .doc, a scan with no text in it) is still uploaded; the card says
 * that nothing could be read from it rather than showing nothing.
 *
 * Flat, not tilted: this card and its two neighbours borrow StickyNote's
 * colours, not the tilt-and-tape treatment — that motif is reserved for the
 * dashboard's wall of things happening to you (see StickyNote's own doc
 * comment), and a profile's sidebar reads as reference material, not mail.
 */
export function ResumeUpload({
  resumePath,
  resumeUrl,
  parsed,
  emptyFields = [],
}: {
  resumePath?: string | null;
  resumeUrl?: string | null;
  /** What was read from the stored resume, or null when nothing could be. */
  parsed?: ResumeFields | null;
  /** Profile fields the candidate hasn't filled in that the resume has something for. */
  emptyFields?: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // Reading the text is best-effort: a resume that can't be read is
      // still a resume worth keeping.
      try {
        const { extractResumeText } = await import("@/lib/profile/resumeParse");
        const text = await extractResumeText(file);
        if (text.trim()) formData.append("text", text);
      } catch {
        // Falls through with no text; the card says so below.
      }
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
    setNotice(null);
    setError(null);
    try {
      const res = await removeResume();
      if (!res.ok) setError(res.error || "Couldn't remove the resume.");
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFill() {
    setBusy(true);
    setError(null);
    try {
      const res = await fillProfileFromResume();
      if (!res.ok) setError(res.error || "Couldn't fill your profile.");
      else setNotice(res.filled.length > 0 ? `Filled in your ${res.filled.join(", ")}. Check it reads right.` : "Nothing left to fill in.");
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setBusy(false);
    }
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

          {resumePath && (
            <div className="mt-3">
              {parsed && parsed.skills.length > 0 ? (
                <>
                  <p className="text-[11px] font-semibold tracking-wide text-[#0A1931]/60 uppercase">Named in your resume</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {parsed.skills.map((skill) => (
                      <span key={skill} className="rounded-full bg-white/70 px-2 py-0.5 text-[11.5px] font-medium text-[#0A1931]">
                        {skill}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                !preview && (
                  <p className="text-[11.5px] leading-relaxed text-[#0A1931]/70">
                    {parsed
                      ? "The file was read, but none of the technologies we look for are named in it."
                      : "Nothing could be read from this file — a .doc, or a scan with no text in it. It is still saved; a PDF or DOCX with real text lets us show hiring teams what it says."}
                  </p>
                )
              )}
              {!preview && emptyFields.length > 0 && (
                <button
                  type="button"
                  onClick={handleFill}
                  disabled={busy}
                  className="mt-2 text-[12px] font-semibold text-[#1A3D63] underline underline-offset-2 hover:text-[#0A1931] disabled:opacity-50"
                >
                  Fill in my {emptyFields.join(", ")} from it
                </button>
              )}
              {notice && <p className="mt-1.5 text-[11.5px] text-[#0A1931]/80">{notice}</p>}
            </div>
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
