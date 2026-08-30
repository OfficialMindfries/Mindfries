import type { IdeTheme } from "./theme";

/** Shared color tokens for the IDE chrome, keyed by theme — modeled on VS Code's default Dark+/Light+ themes. */
export function idePalette(theme: IdeTheme) {
  return theme === "dark"
    ? {
        appBg: "bg-[#1e1e1e]",
        panelBg: "bg-[#252526]",
        border: "border-[#3c3c3c]",
        text: "text-[#cccccc]",
        textMuted: "text-[#8a8a8a]",
        accent: "text-[#a78bfa]",
        hover: "hover:bg-[#2a2d2e]",
        active: "bg-[#37373d]",
        tabActiveBg: "bg-[#1e1e1e]",
        tabInactiveBg: "bg-[#2d2d2d]",
        activityBarBg: "bg-[#333333]",
        activityIcon: "text-[#858585]",
        activityIconActive: "text-white",
        breadcrumbBg: "bg-[#1e1e1e]",
        breadcrumbText: "text-[#8a8a8a]",
        breadcrumbTextActive: "text-[#cccccc]",
      }
    : {
        appBg: "bg-white",
        panelBg: "bg-[#f3f3f3]",
        border: "border-[#e0e0e0]",
        text: "text-[#1e1e1e]",
        textMuted: "text-[#6b6b6b]",
        accent: "text-[#7957da]",
        hover: "hover:bg-[#e8e8e8]",
        active: "bg-[#e4e6f1]",
        tabActiveBg: "bg-white",
        tabInactiveBg: "bg-[#ececec]",
        activityBarBg: "bg-[#2c2c2c]",
        activityIcon: "text-[#c5c5c5]",
        activityIconActive: "text-white",
        breadcrumbBg: "bg-white",
        breadcrumbText: "text-[#6b6b6b]",
        breadcrumbTextActive: "text-[#1e1e1e]",
      };
}

/** Mindfries brand purple — used for the status bar, replacing VS Code's default blue. */
export const STATUS_BAR_BG = "#7957da";
