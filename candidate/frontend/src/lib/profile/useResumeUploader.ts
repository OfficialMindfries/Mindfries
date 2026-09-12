"use client";

import { useRef, useState } from "react";
import { useProfileExtras } from "./storage";

// Shared between the sidebar's Resume card and the "Edit profile" form's
// autofill panel — both need to pick, validate and save a file the same way,
// and having two copies of the validation rules is how they'd quietly drift.

export const ACCEPTED_EXT = [".pdf", ".doc", ".docx"];
export const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export const MAX_RESUME_BYTES = 3 * 1024 * 1024; // 3MB — comfortable for a resume, well inside localStorage's quota once base64-encoded.

export function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function useResumeUploader() {
  const { resume, setResume, removeResume } = useProfileExtras();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick() {
    inputRef.current?.click();
  }

  async function onFile(file: File): Promise<boolean> {
    setError(null);
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ACCEPTED_MIME.has(file.type) && !ACCEPTED_EXT.includes(ext)) {
      setError("PDF, DOC or DOCX only.");
      return false;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setError(`That's ${formatBytes(file.size)} — keep it under ${formatBytes(MAX_RESUME_BYTES)}.`);
      return false;
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
      if (!saved) {
        setError("Couldn't save it — this browser's storage is full. Try clearing site data, or a smaller file.");
        return false;
      }
      return true;
    } catch {
      setError("Couldn't read that file — try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { resume, inputRef, pick, onFile, error, setError, busy, removeResume };
}
