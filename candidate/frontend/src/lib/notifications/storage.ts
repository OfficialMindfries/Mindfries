"use client";

import { useSyncExternalStore } from "react";
import { notifications, type NotificationItem } from "./data";

// Dismissed notifications and "last opened" time, kept in this browser —
// same reasoning and the same cache-the-parsed-value shape as
// lib/profile/storage.ts (a fresh JSON.parse on every read breaks
// useSyncExternalStore's "same reference when nothing changed" contract;
// that one was caught live as an infinite-render loop, so this one is built
// the same careful way from the start rather than risking it again).

interface NotificationsState {
  dismissed: string[];
  lastOpenedAt: string | null;
}

const KEY = "mindfries.notifications";
const EMPTY: NotificationsState = { dismissed: [], lastOpenedAt: null };
const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedValue: NotificationsState = EMPTY;

function parse(raw: string | null): NotificationsState {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationsState>;
    return { dismissed: parsed.dismissed ?? [], lastOpenedAt: parsed.lastOpenedAt ?? null };
  } catch {
    return EMPTY;
  }
}

function read(): NotificationsState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = parse(raw);
  return cachedValue;
}

function write(next: NotificationsState) {
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    return; // Not worth failing over — worst case, dismissals don't survive a reload.
  }
  cachedRaw = raw;
  cachedValue = next;
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useNotifications() {
  const state = useSyncExternalStore(subscribe, read, () => EMPTY);

  const visible: NotificationItem[] = notifications.filter((n) => !state.dismissed.includes(n.id));
  const unreadCount = state.lastOpenedAt
    ? visible.filter((n) => n.at > state.lastOpenedAt!).length
    : visible.length;

  return {
    items: visible,
    unreadCount,
    dismiss(id: string) {
      write({ ...state, dismissed: [...state.dismissed, id] });
    },
    markAllRead() {
      write({ ...state, lastOpenedAt: new Date().toISOString() });
    },
  };
}
