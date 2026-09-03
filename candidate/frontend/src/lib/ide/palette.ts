import type { IdeTheme } from "./theme";

/**
 * Mindfries brand palette (five swatches, darkest to lightest):
 *   NAVY_950 #0A1931 · NAVY_800 #1A3D63 · BLUE_600 #4A7FA7 · BLUE_200 #B3CFE5 · WHITE_50 #F6FAFD
 * Every class below uses one of these five hex values literally (never built
 * via string interpolation — Tailwind's static scanner can't resolve an
 * interpolated arbitrary-value class, only a complete literal one).
 */
export const NAVY_950 = "#0A1931";
export const NAVY_800 = "#1A3D63";
export const BLUE_600 = "#4A7FA7";
export const BLUE_200 = "#B3CFE5";
export const WHITE_50 = "#F6FAFD";

/** Shared color tokens for the IDE chrome, keyed by theme — modeled on VS Code's default Dark+/Light+ themes. */
export function idePalette(theme: IdeTheme) {
  return theme === "dark"
    ? {
        appBg: "bg-[#1A3D63]",
        panelBg: "bg-[#0A1931]",
        border: "border-[#1A3D63]",
        text: "text-[#F6FAFD]",
        textMuted: "text-[#B3CFE5]/70",
        accent: "text-[#B3CFE5]",
        hover: "hover:bg-[#B3CFE5]/10",
        active: "bg-[#4A7FA7]/25",
        tabActiveBg: "bg-[#1A3D63]",
        tabInactiveBg: "bg-[#0A1931]",
        activityBarBg: "bg-[#0A1931]",
        activityIcon: "text-[#B3CFE5]/70",
        activityIconActive: "text-[#F6FAFD]",
        breadcrumbBg: "bg-[#1A3D63]",
        breadcrumbText: "text-[#B3CFE5]/70",
        breadcrumbTextActive: "text-[#F6FAFD]",
      }
    : {
        appBg: "bg-[#F6FAFD]",
        panelBg: "bg-[#B3CFE5]/20",
        border: "border-[#B3CFE5]",
        text: "text-[#0A1931]",
        textMuted: "text-[#4A7FA7]",
        accent: "text-[#4A7FA7]",
        hover: "hover:bg-[#B3CFE5]/30",
        active: "bg-[#B3CFE5]/50",
        tabActiveBg: "bg-[#F6FAFD]",
        tabInactiveBg: "bg-[#B3CFE5]/15",
        activityBarBg: "bg-[#0A1931]",
        activityIcon: "text-[#B3CFE5]",
        activityIconActive: "text-[#F6FAFD]",
        breadcrumbBg: "bg-[#F6FAFD]",
        breadcrumbText: "text-[#4A7FA7]",
        breadcrumbTextActive: "text-[#0A1931]",
      };
}

/** Mindfries brand blue — used for the status bar, replacing VS Code's default blue. */
export const STATUS_BAR_BG = BLUE_600;
