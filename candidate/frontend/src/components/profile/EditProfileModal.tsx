"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Pencil, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { saveIdentity } from "@/lib/profile/actions";
import { usePreviewMode } from "./PreviewMode";

type FormState = { name: string; role: string; location: string; openTo: string[]; noticePeriod: string; bio: string };

/**
 * "Edit profile" — the one button that opens the one place everything on
 * this page (besides the resume and the linked accounts, which manage
 * themselves) gets changed.
 *
 * Saves directly to the database via a Server Action (saveIdentity).
 */
export function EditProfileModal({ savedIdentity }: { savedIdentity: any }) {
  const preview = usePreviewMode();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => savedIdentity);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  function openModal() {
    setForm(savedIdentity);
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
  }

  async function save() {
    if (!form.name.trim() || !form.role.trim()) {
      setFieldError("Name and role can't be empty.");
      return;
    }
    setFieldError(null);
    setSaveError(null);
    setSaving(true);

    const res = await saveIdentity({
      name: form.name.trim(),
      role: form.role.trim(),
      location: form.location.trim(),
      openTo: form.openTo,
      noticePeriod: form.noticePeriod,
      bio: form.bio.trim(),
    });

    setSaving(false);

    if (res.ok) {
      setOpen(false);
    } else {
      setSaveError(res.error || "Couldn't save changes.");
    }
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
              {/* ── Fields ──────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Name">
                  <input
                    ref={firstFieldRef}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Role / headline">
                  <input value={form.role} onChange={(e) => set("role", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Location">
                  <input value={form.location} onChange={(e) => set("location", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Notice period">
                  <select value={form.noticePeriod} onChange={(e) => set("noticePeriod", e.target.value)} className={inputCls}>
                    {["Immediately", "2 weeks", "30 days", "60 days", "90 days"].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="col-span-2">
                  <span className="mb-1.5 block text-xs font-semibold text-[#4A7FA7]">Open to</span>
                  <div className="flex flex-wrap gap-1.5">
                    {["Remote", "Hybrid", "Onsite"].map((opt) => {
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
                  <Field label="About you">
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
              <Button tone="primary" size="sm" onClick={save} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Saving…
                  </>
                ) : (
                  "Save changes"
                )}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#4A7FA7]">
        {label}
      </span>
      {children}
    </label>
  );
}
