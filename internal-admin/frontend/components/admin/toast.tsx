"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck, OctagonAlert, TriangleAlert, X, type LucideIcon } from "lucide-react";

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

// Tinted cards after the supplied design: each tone is its own colour family —
// a soft wash, a slightly deeper border, an outline icon, a title and body in
// the tone's dark and mid shades, and a glow of the same colour underneath.
// The icon shapes differ as well as the colours (circle, triangle, octagon),
// so the kind of message is readable without relying on colour alone.
const TONE: Record<ToastTone, { icon: LucideIcon; card: string; title: string; body: string; glyph: string; glow: string }> = {
  success: {
    icon: CircleCheck,
    card: "border-[#bfe6cc] bg-[linear-gradient(135deg,#ecf9f0,#d9f1e2)]",
    title: "text-[#1c7f37]", body: "text-[#3d9a57]", glyph: "text-[#2a9148]",
    glow: "shadow-[0_14px_30px_-14px_rgba(42,145,72,0.45)]",
  },
  warning: {
    icon: TriangleAlert,
    card: "border-[#f1d98f] bg-[linear-gradient(135deg,#fff8e1,#fdedc6)]",
    title: "text-[#8a6700]", body: "text-[#a8841c]", glyph: "text-[#9c7708]",
    glow: "shadow-[0_14px_30px_-14px_rgba(196,150,20,0.45)]",
  },
  info: {
    icon: CircleAlert,
    card: "border-[#bfd2f8] bg-[linear-gradient(135deg,#edf3ff,#dce7fd)]",
    title: "text-[#2553c4]", body: "text-[#4a72d4]", glyph: "text-[#3263d2]",
    glow: "shadow-[0_14px_30px_-14px_rgba(50,99,210,0.42)]",
  },
  error: {
    icon: OctagonAlert,
    card: "border-[#f4c3b9] bg-[linear-gradient(135deg,#fff0ec,#fcdcd4)]",
    title: "text-[#bf2419]", body: "text-[#cf4a3f]", glyph: "text-[#c92e22]",
    glow: "shadow-[0_14px_30px_-14px_rgba(201,46,34,0.42)]",
  },
};

export function Toaster() {
  const items = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  return (
    // Two live regions: errors interrupt a screen reader, everything else waits.
    <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-[370px] max-w-[calc(100vw-2.5rem)] flex-col gap-3">
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
  const Icon = tone.icon;
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
      className={`pointer-events-auto flex items-center gap-3.5 rounded-[18px] border-[1.5px] px-4 py-3.5 motion-safe:animate-[toast-in_180ms_ease-out] ${tone.card} ${tone.glow}`}
    >
      <Icon size={26} strokeWidth={1.9} className={`shrink-0 ${tone.glyph}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className={`text-[15px] font-semibold leading-snug ${tone.title}`}>{t.title}</div>
        {t.body && <div className={`mt-0.5 text-[13px] leading-snug ${tone.body}`}>{t.body}</div>}
        {t.action && (
          <Link
            href={t.action.href}
            onClick={() => dismiss(t.id)}
            className={`mt-1 inline-block text-[13px] font-semibold underline decoration-1 underline-offset-2 ${tone.title}`}
          >
            {t.action.label} →
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss notification"
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition hover:bg-white/60 ${tone.glyph}`}
      >
        <X size={17} strokeWidth={2.4} />
      </button>
    </div>
  );
}
