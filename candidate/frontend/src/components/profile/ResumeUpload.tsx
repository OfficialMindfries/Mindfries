"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { useProfileExtras } from "@/lib/profile/storage";

const ACCEPTED = [".pdf", ".doc", ".docx"];
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_BYTES = 3 * 1024 * 1024; // 3MB — comfortable for a resume, well inside localStorage's quota once base64-encoded.

function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A real file picker, honestly scoped: the file is read and held in this
 * browser's localStorage, not sent anywhere — there's no server to send it
 * to yet. Saying "uploaded" would claim more than that, so the copy says
 * "saved in this browser" throughout, the same distinction useActor.ts and
 * the admin's file-store backend already draw elsewhere in this codebase.
 */
export function ResumeUpload() {
  const { resume, setResume, removeResume } = useProfileExtras();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick() {
    inputRef.current?.click();
  }

  async function onFile(file: File) {
    setError(null);
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ACCEPTED_TYPES.has(file.type) && !ACCEPTED.includes(ext)) {
      setError("PDF, DOC or DOCX only.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That's ${formatBytes(file.size)} — keep it under ${formatBytes(MAX_BYTES)}.`);
      return;
    }

    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error("Couldn't read that file."));
        reader.readAsDataURL(file);
      });
      const saved = setResume({ fileName: file.name, sizeBytes: file.size, mimeType: file.type, dataUrl, savedAt: new Date().toISOString() });
      if (!saved) setError("Couldn't save it — this browser's storage is full. Try clearing site data, or a smaller file.");
    } catch {
      setError("Couldn't read that file — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#B3CFE5] bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B3CFE5]/40 text-[#1A3D63]">
          <FileText size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[#0A1931]">Resume</h2>

          {resume ? (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#B3CFE5] bg-[#F6FAFD] px-3 py-2">
              <Paperclip size={14} className="shrink-0 text-[#4A7FA7]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[#0A1931]">{resume.fileName}</p>
                <p className="text-[11px] text-[#4A7FA7]">
                  {formatBytes(resume.sizeBytes)} · saved {formatDate(resume.savedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  removeResume();
                  setError(null);
                }}
                aria-label="Remove resume"
                className="shrink-0 rounded-lg p-1.5 text-[#4A7FA7] transition-colors hover:bg-[#B3CFE5]/40 hover:text-[#c0304c]"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed text-[#4A7FA7]">
              PDF, DOC or DOCX, up to {formatBytes(MAX_BYTES)}.
            </p>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={pick}
              disabled={busy}
              className="btn-wipe px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-50"
              style={{ "--btn-bg": "#E3EDF7", "--btn-fg": "#1A3D63", "--btn-fill": "#1A3D63", "--btn-fg-hover": "#F6FAFD" } as React.CSSProperties}
            >
              {busy ? "Reading…" : resume ? "Replace" : "Choose file"}
            </button>
            {error && <span className="text-[12px] text-[#c0304c]">{error}</span>}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={[...ACCEPTED, ...ACCEPTED_TYPES].join(",")}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // so choosing the same file twice still fires onChange
              if (file) void onFile(file);
            }}
          />

          <p className="mt-3 text-[11px] leading-relaxed text-[#4A7FA7]">
            Saved in this browser only — not yet sent to Mindfries or shared with a hiring team.
          </p>
        </div>
      </div>
    </section>
  );
}
