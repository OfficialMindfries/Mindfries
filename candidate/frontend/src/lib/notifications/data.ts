import { Ban, Bell, CheckCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";

/**
 * Five tones, matching the design reference exactly: a pastel card, an icon
 * in its own softer badge, a bold title and a muted subtitle. Reused from
 * nowhere else in this app — it's specific to this one panel — but built as
 * a lookup table rather than five near-duplicate components, the same
 * reasoning behind every other TONE map in this codebase.
 */
export type NotificationTone = "neutral" | "info" | "success" | "warning" | "error";

interface ToneStyle {
  icon: LucideIcon;
  card: string;
  badge: string;
  iconColor: string;
}

export const TONES: Record<NotificationTone, ToneStyle> = {
  neutral: { icon: Info, card: "bg-[#F1F3F6]", badge: "bg-white", iconColor: "#5B6472" },
  info: { icon: Bell, card: "bg-[#E8EDFB]", badge: "bg-white", iconColor: "#3454A8" },
  success: { icon: CheckCheck, card: "bg-[#E3F7EC]", badge: "bg-white", iconColor: "#1A9E6B" },
  warning: { icon: TriangleAlert, card: "bg-[#FDF0E1]", badge: "bg-white", iconColor: "#C26410" },
  error: { icon: Ban, card: "bg-[#FBE9EA]", badge: "bg-white", iconColor: "#A6203C" },
};

export interface NotificationItem {
  id: string;
  tone: NotificationTone;
  title: string;
  body: string;
  at: string;
}

/**
 * Sample notifications, drawn from the same sample data the rest of the
 * dashboard already renders (lib/dashboard/data.ts's `activity` and
 * `assessments`) — a fourth, independent invented version of "what's
 * happening" would drift from what the Dashboard and Assessments pages
 * already say about the same events.
 *
 * No `error`-tone notification is seeded: nothing in the sample data
 * represents a real failure (a session didn't start, an upload failed), and
 * one would have to be invented to fill the slot. The tone is fully built
 * and ready — see TONES — for the day something real triggers it.
 */
export const notifications: NotificationItem[] = [
  {
    id: "n-invite",
    tone: "info",
    title: "Invited to Senior Engineer, Agentic AI",
    body: "Northwind Labs · take-home, 90 minutes",
    at: "2026-09-01T11:22:00Z",
  },
  {
    id: "n-due-soon",
    tone: "warning",
    title: "Senior Engineer, Agentic AI closes in 3 days",
    body: "Start it from Assessments whenever you're ready.",
    at: "2026-09-10T09:00:00Z",
  },
  {
    id: "n-report",
    tone: "success",
    title: "Evidence report shared with Halden & Co.",
    body: "Navigation, commits, tests and reasoning from your session.",
    at: "2026-09-12T09:14:00Z",
  },
  {
    id: "n-info",
    tone: "neutral",
    title: "You're in control of these",
    body: "Dismiss any notification — nothing here affects your evidence report.",
    at: "2026-08-30T08:00:00Z",
  },
];
