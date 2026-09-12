"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, FileText, Loader2, Pencil, Sparkles, Upload, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { useProfileExtras } from "@/lib/profile/storage";
import { resolveIdentity, NOTICE_PERIODS, OPEN_TO_OPTIONS } from "@/lib/profile/data";
import { extractResumeText, suggestFieldsFromText, UnparsableFileError, type ResumeSuggestions } from "@/lib/profile/resumeParse";
import { ACCEPTED_EXT, ACCEPTED_MIME, formatBytes, MAX_RESUME_BYTES, useResumeUploader } from "@/lib/profile/useResumeUploader";
import { usePreviewMode } from "./PreviewMode";

type FormState = { name: string; role: string; location: string; openTo: string[]; noticePeriod: string; bio: string };
type AutofillState = { status: "idle" | "running" | "done" | "error"; error?: string; filled: Set<keyof ResumeSuggestions> };

const IDLE: AutofillState = { status: "idle", filled: new Set() };

/**
 * "Edit profile" — the one button that opens the one place everything on
 * this page (besides the resume and the linked accounts, which manage
 * themselves) gets changed.
 *
 * The autofill panel at the top runs real extraction on the real resume
 * already saved (lib/profile/resumeParse.ts) — a heuristic, not a language
 * model, so it's offered as suggestions the person reviews, not written in
 * silently. A field it touches gets a small "from resume" tag until the
 * person edits it themselves, so what came from the file and what they typed
 * stay visibly distinct until they've had a chance to check it.
 */
export function EditProfileModal() {
  const preview = usePreviewMode();
  const { identity: saved, resume, setIdentity } = useProfileExtras();
  const { inputRef: resumeInputRef, pick: pickResume, onFile: onResumeFile, error: resumeError, busy: resumeBusy } = useResumeUploader();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => resolveIdentity(saved));
  const [autofill, setAutofill] = useState<AutofillState>(IDLE);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  function openModal() {
    setForm(resolveIdentity(saved));
    setAutofill(IDLE);
    setSaveError(null);
    setFieldError(null);
    setOpen(true);
  }

  useEffect(() => {
    if (open) firstFieldRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    // Once they've touched a field themselves, it's no longer "what the
    // resume said" — drop the tag rather than let it keep claiming credit.
    setAutofill((a) => {
      if (!a.filled.has(key as keyof ResumeSuggestions)) return a;
      const filled = new Set(a.filled);
      filled.delete(key as keyof ResumeSuggestions);
      return { ...a, filled };
    });
  }

  async function runAutofill() {
    if (!resume) return;
    setAutofill({ status: "running", filled: new Set() });
    try {
      const text = await extractResumeText(resume.mimeType, resume.dataUrl);
      const suggestions = suggestFieldsFromText(text);

      // Computed up front, independent of the setForm updater below: an
      // updater function runs on React's own schedule, not synchronously on
      // this line, so a Set mutated only inside one and read right after is
      // read before it's actually been touched. Caught this live — the
      // fields filled in correctly while the summary above them still said
      // "couldn't find anything," because the check ran first.
      const filled = new Set<keyof ResumeSuggestions>();
      if (suggestions.name) filled.add("name");
      if (suggestions.role) filled.add("role");
      if (suggestions.location) filled.add("location");
      if (suggestions.bio) filled.add("bio");

      setForm((f) => ({
        ...f,
        ...(suggestions.name && { name: suggestions.name }),
        ...(suggestions.role && { role: suggestions.role }),
        ...(suggestions.location && { location: suggestions.location }),
        ...(suggestions.bio && { bio: suggestions.bio }),
      }));

      if (filled.size === 0) {
        setAutofill({
          status: "error",
          filled,
          error: "Couldn't find anything usable in that file — it may not follow a standard resume layout. Worth filling in yourself.",
        });
      } else {
        setAutofill({ status: "done", filled });
      }
    } catch (e) {
      setAutofill({
        status: "error",
        filled: new Set(),
        error: e instanceof UnparsableFileError ? e.message : e instanceof Error ? e.message : "Couldn't read that file.",
      });
    }
  }

  function save() {
    if (!form.name.trim() || !form.role.trim()) {
      setFieldError("Name and role can't be empty.");
      return;
    }
    setFieldError(null);
    const ok = setIdentity({
      name: form.name.trim(),
      role: form.role.trim(),
      location: form.location.trim(),
      openTo: form.openTo,
      noticePeriod: form.noticePeriod,
      bio: form.bio.trim(),
    });
    if (ok) setOpen(false);
    else setSaveError("Couldn't save — this browser's storage is full.");
  }

  if (preview) return null;

  return (
    <>
      <Button tone="ghost" size="sm" onClick={openModal} className="border border-[#B3CFE5]">
        <Pencil size={13} />
        Edit profile
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0A1931]/45 p-4 py-10 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit profile"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-20px_rgba(10,25,49,0.45)]"
          >
            <div className="flex items-center justify-between border-b border-[#B3CFE5] px-6 py-4">
              <h2 className="text-[17px] font-semibold text-[#0A1931]">Edit profile</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-[#4A7FA7] transition-colors hover:bg-[#B3CFE5]/30 hover:text-[#1A3D63]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              {/* ── Autofill from resume ─────────────────────────────────── */}
              <div className="rounded-xl border border-dashed border-[#4A7FA7]/50 bg-[#F6FAFD] p-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="shrink-0 text-[#4A7FA7]" />
                  <h3 className="text-[13px] font-semibold text-[#0A1931]">Autofill from resume</h3>
                </div>

                {resume ? (
                  <>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-[#1A3D63]">
                        <FileText size={13} className="shrink-0 text-[#4A7FA7]" />
                        <span className="max-w-[220px] truncate">{resume.fileName}</span>
                      </span>
                      <Button
                        type="button"
                        tone="soft"
                        size="sm"
                        onClick={() => void runAutofill()}
                        disabled={autofill.status === "running"}
                        className="!px-3 !py-1.5 !text-[12px]"
                      >
                        {autofill.status === "running" ? (
                          <>
                            <Loader2 size={12} className="animate-spin" /> Reading…
                          </>
                        ) : autofill.status === "done" ? (
                          "Run again"
                        ) : (
                          "Autofill"
                        )}
                      </Button>
                    </div>

                    {autofill.status === "done" && (
                      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[#1A9E6B]">
                        <Check size={13} /> Filled {autofill.filled.size} field{autofill.filled.size === 1 ? "" : "s"} from the resume — check them below.
                      </p>
                    )}
                    {autofill.status === "error" && (
                      <p className="mt-2 flex items-start gap-1.5 text-[12px] text-[#a6203c]">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {autofill.error}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#4A7FA7]">
                      Add a resume to fill in what it can — you&apos;ll still review every field.
                    </p>
                    <div className="mt-2.5 flex items-center gap-3">
                      <Button
                        type="button"
                        tone="soft"
                        size="sm"
                        onClick={pickResume}
                        disabled={resumeBusy}
                        className="!px-3 !py-1.5 !text-[12px]"
                      >
                        <Upload size={12} />
                        {resumeBusy ? "Reading…" : "Choose file"}
                      </Button>
                      {resumeError && <span className="text-[12px] text-[#a6203c]">{resumeError}</span>}
                    </div>
                    <input
                      ref={resumeInputRef}
                      type="file"
                      accept={[...ACCEPTED_EXT, ...ACCEPTED_MIME].join(",")}
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void onResumeFile(file);
                      }}
                    />
                    <p className="mt-2 text-[11px] text-[#4A7FA7]">PDF, DOC or DOCX, up to {formatBytes(MAX_RESUME_BYTES)}.</p>
                  </>
                )}
              </div>

              {/* ── Fields ──────────────────────────────────────────────── */}
              <div className="mt-5 grid grid-cols-2 gap-4">
                <Field label="Name" autofilled={autofill.filled.has("name")}>
                  <input
                    ref={firstFieldRef}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Role / headline" autofilled={autofill.filled.has("role")}>
                  <input value={form.role} onChange={(e) => set("role", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Location" autofilled={autofill.filled.has("location")}>
                  <input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Notice period">
                  <select value={form.noticePeriod} onChange={(e) => set("noticePeriod", e.target.value)} className={inputCls}>
                    {NOTICE_PERIODS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold text-[#4A7FA7]">Open to</span>
                  <div className="flex flex-wrap gap-1.5">
                    {OPEN_TO_OPTIONS.map((opt) => {
                      const on = form.openTo.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => set("openTo", on ? form.openTo.filter((o) => o !== opt) : [...form.openTo, opt])}
                          className={clsx(
                            "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                            on ? "border-[#1A3D63] bg-[#1A3D63] text-white" : "border-[#B3CFE5] bg-white text-[#4A7FA7] hover:bg-[#B3CFE5]/20"
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="col-span-2">
                  <Field label="About you" autofilled={autofill.filled.has("bio")}>
                    <textarea
                      value={form.bio}
                      onChange={(e) => set("bio", e.target.value)}
                      rows={4}
                      maxLength={500}
                      className={clsx(inputCls, "resize-none")}
                    />
                  </Field>
                  <p className="mt-1 text-right text-[11px] text-[#4A7FA7]">{form.bio.length}/500</p>
                </div>
              </div>

              {fieldError && <p className="mt-3 text-[12.5px] text-[#a6203c]">{fieldError}</p>}
              {saveError && <p className="mt-3 text-[12.5px] text-[#a6203c]">{saveError}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#B3CFE5] px-6 py-4">
              <Button tone="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button tone="primary" size="sm" onClick={save}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const inputCls =
  "w-full rounded-lg border border-[#B3CFE5] bg-white px-3 py-2 text-[13.5px] text-[#0A1931] outline-none transition focus:border-[#1A3D63]";

function Field({ label, autofilled, children }: { label: string; autofilled?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#4A7FA7]">
        {label}
        {autofilled && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-[#4A7FA7]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#1A3D63]">
            <Sparkles size={9} /> from resume
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
