"use client";

import { Bell, BellOff, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TONES } from "@/lib/notifications/data";
import { dismissNotification, loadNotifications, markNotificationsRead, type BellItem } from "@/lib/notifications/actions";
import { useDismissablePanel } from "@/lib/useDismissablePanel";

/** Ids already reported as read in this page's lifetime, so opening the panel twice doesn't send them twice. */
const seen = new Set<string>();

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
 * What it shows is worked out from the candidate's own records each time
 * (lib/notifications/derive.ts): an invitation waiting for an answer, a due
 * date coming up, a report that has finished. Read and dismissed are kept
 * on the server, so they follow the candidate to another browser. Opening
 * the panel marks everything read; a dismissed item stays gone.
 *
 * It asks again when the tab comes back into view, so a tab left open
 * overnight isn't showing yesterday's list.
 */
export function NotificationBell() {
  const { open, setOpen, ref } = useDismissablePanel<HTMLDivElement>();
  const [items, setItems] = useState<BellItem[]>([]);

  const refresh = useCallback(() => {
    loadNotifications()
      .then(setItems)
      .catch(() => {
        // A failed read leaves the bell as it was; it will ask again.
      });
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const unreadCount = items.filter((n) => !n.read).length;

  // Opening the panel is reading it. The dot clears at once; the cards keep
  // their unread look until the panel is closed, so it's clear which were new.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- settles the list once the panel that was showing "new" markers has closed
      setItems((list) => (list.some((n) => !n.read && seen.has(n.id)) ? list.map((n) => (seen.has(n.id) ? { ...n, read: true } : n)) : list));
      return;
    }
    const unread = items.filter((n) => !n.read && !seen.has(n.id)).map((n) => n.id);
    if (unread.length === 0) return;
    unread.forEach((id) => seen.add(id));
    void markNotificationsRead(unread);
  }, [open, items]);

  function dismiss(id: string) {
    setItems((list) => list.filter((n) => n.id !== id));
    void dismissNotification(id);
  }

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
        {unreadCount > 0 && !open && (
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
                    <Link href={n.href} onClick={() => setOpen(false)} className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug font-semibold text-[#0A1931]">
                        {n.title}
                        {!n.read && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#E06C75] align-middle" aria-label="new" />}
                      </p>
                      <p className="mt-0.5 text-[12px] leading-snug text-[#0A1931]/70">{n.body}</p>
                      <p className="mt-1 text-[10.5px] text-[#0A1931]/50">{formatWhen(n.at)}</p>
                    </Link>
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
