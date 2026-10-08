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
