"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Notifications for the admin panel: small cards that pop up in the bottom-
 * right corner, stack, and go away on their own. Every message the admin
 * shows about something that *happened* — saved, sent, failed, not set up —
 * goes through here, so they all look and behave the same way.
 *
 * Call `toast.success(...)`, `toast.error(...)`, `toast.warning(...)` or
 * `toast.info(...)` from any client component; `<Toaster />` is mounted once
 * in the admin layout. It's a tiny external store rather than a React context,
 * so a toast can be raised from anywhere without threading a provider through.
 *
 * What stays out of here, on purpose: warnings about the *current state* of a
 * form — "this person asked not to be contacted" next to a disabled button —
 * are explanations, not events. A pop-up would vanish while the reason the
 * button is disabled is still true.
 */

export type ToastTone = "success" | "error" | "warning" | "info";

export interface ToastInput {
  title: string;
  body?: string;
  tone?: ToastTone;
  action?: { label: string; href: string };
  /** ms before it closes itself; 0 keeps it until dismissed. */
  duration?: number;
}

interface Toast extends Required<Pick<ToastInput, "title" | "tone" | "duration">> {
  id: number;
  body?: string;
  action?: { label: string; href: string };
}

// Successes are confirmation and can go quickly; errors need time to be read;
// warnings about setup stay until someone closes them.
const DEFAULT_DURATION: Record<ToastTone, number> = { success: 3500, info: 4500, error: 7000, warning: 0 };
const MAX_VISIBLE = 4;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(input: ToastInput): number {
  const tone = input.tone ?? "info";
  const t: Toast = {
    id: nextId++,
    title: input.title,
    body: input.body,
    tone,
    action: input.action,
    duration: input.duration ?? DEFAULT_DURATION[tone],
  };
  // Newest on top; the oldest falls off rather than the stack growing up the screen.
  toasts = [t, ...toasts].slice(0, MAX_VISIBLE);
  emit();
  return t.id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

type Extra = Omit<ToastInput, "title" | "body" | "tone">;
export const toast = Object.assign((input: ToastInput) => push(input), {
  success: (title: string, body?: string, extra?: Extra) => push({ ...extra, title, body, tone: "success" }),
  error: (title: string, body?: string, extra?: Extra) => push({ ...extra, title, body, tone: "error" }),
  warning: (title: string, body?: string, extra?: Extra) => push({ ...extra, title, body, tone: "warning" }),
  info: (title: string, body?: string, extra?: Extra) => push({ ...extra, title, body, tone: "info" }),
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => toasts;
const EMPTY: Toast[] = [];

const TONE: Record<ToastTone, { icon: string; ring: string; bar: string }> = {
  success: { icon: "✓", ring: "bg-[#15a34a]/12 text-[#15a34a]", bar: "bg-[#15a34a]" },
  error: { icon: "!", ring: "bg-[#f4502f]/12 text-[#f4502f]", bar: "bg-[#f4502f]" },
  warning: { icon: "!", ring: "bg-[#d97706]/12 text-[#b45309]", bar: "bg-[#d97706]" },
  info: { icon: "i", ring: "bg-accent-soft text-accent", bar: "bg-accent" },
};

export function Toaster() {
  const items = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  return (
    // Two live regions: errors interrupt a screen reader, everything else waits.
    <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-[360px] max-w-[calc(100vw-2.5rem)] flex-col gap-2">
      <div role="alert" className="contents">
        {items.filter((t) => t.tone === "error").map((t) => <ToastCard key={t.id} t={t} />)}
      </div>
      <div role="status" aria-live="polite" className="contents">
        {items.filter((t) => t.tone !== "error").map((t) => <ToastCard key={t.id} t={t} />)}
      </div>
    </div>
  );
}

function ToastCard({ t }: { t: Toast }) {
  const tone = TONE[t.tone];
  const [paused, setPaused] = useState(false);
  const left = useRef(t.duration);
  const startedAt = useRef(0);

  // Auto-dismiss, paused while the pointer is over it — nobody should lose a
  // message because they were halfway through reading it.
  useEffect(() => {
    if (t.duration === 0 || paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => dismiss(t.id), left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - startedAt.current;
    };
  }, [paused, t.id, t.duration]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto relative flex gap-3 overflow-hidden rounded-xl border border-hair bg-surface py-3 pr-3 pl-3.5 shadow-[0_12px_32px_-12px_rgba(16,16,24,0.28)] motion-safe:animate-[toast-in_180ms_ease-out]"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} aria-hidden />
      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${tone.ring}`} aria-hidden>
        {tone.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-snug">{t.title}</div>
        {t.body && <div className="mt-0.5 text-xs leading-relaxed text-dim">{t.body}</div>}
        {t.action && (
          <Link href={t.action.href} onClick={() => dismiss(t.id)} className="mt-1.5 inline-block text-xs font-semibold text-accent hover:underline">
            {t.action.label} →
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss notification"
        className="-mt-0.5 h-6 w-6 shrink-0 rounded-md text-dim hover:bg-black/5 hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}
