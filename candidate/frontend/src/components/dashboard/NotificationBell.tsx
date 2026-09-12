"use client";

import { Bell, BellOff, X } from "lucide-react";
import { useEffect } from "react";
import { TONES } from "@/lib/notifications/data";
import { useNotifications } from "@/lib/notifications/storage";
import { useDismissablePanel } from "@/lib/useDismissablePanel";

function formatWhen(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const day = 86_400_000;
  if (ms < day) return "Today";
  if (ms < 2 * day) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * The bell in the top bar — a real dropdown of real notifications, styled
 * to the reference design: a pastel card per tone, the icon in its own
 * lighter badge, a bold title over a muted subtitle, a dismiss X.
 *
 * Content is drawn from the same sample activity/assessments the rest of
 * the dashboard already shows (lib/notifications/data.ts) rather than
 * invented separately. Dismissing a notification and the unread count are
 * both real, kept in this browser (lib/notifications/storage.ts) — opening
 * the panel marks everything read, and a dismissed item stays gone across a
 * reload.
 */
export function NotificationBell() {
  const { open, setOpen, ref } = useDismissablePanel<HTMLDivElement>();
  const { items, unreadCount, dismiss, markAllRead } = useNotifications();

  useEffect(() => {
    if (open) markAllRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever needs to fire on open, not whenever markAllRead's identity happens to change
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-[#4A7FA7] transition-colors hover:bg-[#B3CFE5]/30 hover:text-[#1A3D63]"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#E06C75]" />
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-40 mt-2 w-[340px] overflow-hidden rounded-2xl border border-[#B3CFE5] bg-white shadow-[0_20px_45px_-16px_rgba(10,25,49,0.35)]">
          <div className="border-b border-[#B3CFE5] px-4 py-3">
            <h2 className="text-[13.5px] font-semibold text-[#0A1931]">Notifications</h2>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <BellOff size={20} className="text-[#B3CFE5]" />
              <p className="text-[12.5px] text-[#4A7FA7]">You&apos;re all caught up.</p>
            </div>
          ) : (
            <ul className="max-h-[70vh] space-y-2 overflow-y-auto p-2.5">
              {items.map((n) => {
                const tone = TONES[n.tone];
                const Icon = tone.icon;
                return (
                  <li key={n.id} className={`flex items-start gap-3 rounded-xl ${tone.card} p-3`}>
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone.badge}`}
                      style={{ color: tone.iconColor }}
                    >
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug font-semibold text-[#0A1931]">{n.title}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-[#0A1931]/70">{n.body}</p>
                      <p className="mt-1 text-[10.5px] text-[#0A1931]/50">{formatWhen(n.at)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismiss(n.id)}
                      aria-label="Dismiss"
                      className="shrink-0 rounded-lg p-1 text-[#0A1931]/40 transition-colors hover:bg-white/60 hover:text-[#0A1931]"
                    >
                      <X size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
