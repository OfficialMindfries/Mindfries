"use client";

import { useEffect, type ReactNode } from "react";
import type { Tone } from "@/lib/format";

// Copied from internal-admin/frontend/components/ui.tsx (IMPLEMENTATION.md
// §2.1/§4) — there is no shared package between the three apps yet, so this
// is a deliberate duplicate, not an import. Keep it byte-for-byte reusable:
// changes that are genuinely about this component set belong in both copies.

const toneClass: Record<Tone, string> = {
  violet: "border-[#d9cdfa] bg-[#f4f0ff] text-[#6d3fe0]",
  coral: "border-[#fbd0d4] bg-[#fff1f2] text-[#d93a44]",
  green: "border-[#c5ecd5] bg-[#effbf4] text-[#1b8f4e]",
  amber: "border-[#f3dca6] bg-[#fff8e8] text-[#b7791f]",
  gray: "border-hair bg-surface-2 text-dim",
};

export function Pill({ tone = "gray", children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${toneClass[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full bg-current ${tone === "violet" ? "pulse-dot" : ""}`} />}
      {children}
    </span>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="hair-card p-5">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-sm text-dim">{hint}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children, action }: { eyebrow: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{title}</h1>
        {children && <p className="mt-2 max-w-2xl text-sm text-dim">{children}</p>}
      </div>
      {action}
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "soft" | "danger";
  size?: "sm" | "md";
};

/**
 * The fill-from-the-left button. The mechanic (the ::before that grows to
 * 100% on hover) is one class in globals.css, because a pseudo-element can't
 * be styled from the style attribute. Everything that differs between
 * variants is set inline here as custom properties, so this file is the
 * only place to look to know what a variant looks like.
 */
const TONES: Record<NonNullable<ButtonProps["variant"]>, React.CSSProperties> = {
  primary: { "--btn-bg": "var(--color-accent)", "--btn-fg": "#ffffff", "--btn-fill": "#3b1d8f", "--btn-fg-hover": "#ffffff" },
  danger: { "--btn-bg": "var(--color-accent-2)", "--btn-fg": "#ffffff", "--btn-fill": "#a62c14", "--btn-fg-hover": "#ffffff" },
  soft: { "--btn-bg": "#efeafd", "--btn-fg": "#5b21b6", "--btn-fill": "var(--color-accent)", "--btn-fg-hover": "#ffffff" },
  ghost: { "--btn-bg": "#f0f0f4", "--btn-fg": "var(--color-ink)", "--btn-fill": "var(--color-ink)", "--btn-fg-hover": "#f4f4f7" },
} as Record<NonNullable<ButtonProps["variant"]>, React.CSSProperties>;

export function Button({ variant = "primary", size = "md", className = "", style, ...p }: ButtonProps) {
  const pad = size === "sm" ? "px-4 py-2 text-[13px]" : "px-6 py-3 text-[15px]";
  return (
    <button
      {...p}
      style={{ ...TONES[variant], ...style }}
      className={`btn-wipe inline-flex items-center justify-center gap-2 font-extrabold ${pad} ${className}`}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-dim">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

const fieldCls =
  "w-full rounded-xl border border-hair bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent focus:bg-surface";
export function Input({ className = "", ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`${fieldCls} ${className}`} />;
}
export function Textarea({ className = "", ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`${fieldCls} ${className}`} />;
}
export function Select({ className = "", ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${fieldCls} ${className}`} />;
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-lg bg-surface-2 px-2 py-0.5 text-xs font-medium text-dim">{children}</span>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className="panel relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-hair px-6 py-4">
          <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-dim hover:bg-black/5">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-hair px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="hair-card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="text-base font-bold">{title}</div>
      {hint && <p className="max-w-sm text-sm text-dim">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
