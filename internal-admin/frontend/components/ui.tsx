"use client";

import { useEffect, type ReactNode } from "react";
import type { Tone } from "@/lib/format";

const toneClass: Record<Tone, string> = {
  violet: "bg-accent-soft text-accent",
  coral: "bg-[#f4502f]/12 text-[#f4502f]",
  green: "bg-[#15a34a]/12 text-[#15a34a]",
  amber: "bg-[#d97706]/12 text-[#b45309]",
  gray: "bg-black/[0.06] text-dim",
};

export function Pill({ tone = "gray", children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass[tone]}`}>
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
};
export function Button({ variant = "primary", className = "", ...p }: ButtonProps) {
  const v = {
    primary: "bg-accent text-white hover:brightness-110",
    danger: "bg-accent-2 text-white hover:brightness-110",
    soft: "bg-accent-soft text-accent hover:brightness-105",
    ghost: "border border-hair bg-surface text-ink hover:border-hair-bright",
  }[variant];
  return (
    <button
      {...p}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${v} ${className}`}
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
