import type { CSSProperties, ReactNode } from "react";

/**
 * The candidate portal's button — the same fill-from-the-left hover the
 * internal admin uses, in this app's blues.
 *
 * The mechanic (the ::before that grows to 100% on hover) is one class in
 * globals.css, because a pseudo-element can't be styled from the style
 * attribute. Everything that differs between variants — the resting colour,
 * the colour that sweeps in, and the text colour on either side — is set
 * inline here, so this file is the only place to look to know what a variant
 * looks like.
 *
 * There was no shared button before this: every call site wrote its own
 * `rounded-lg bg-[#1A3D63] px-4 py-2.5 …`, which is why they had drifted to
 * three different paddings and two different radii.
 */

export type ButtonTone = "primary" | "onDark" | "soft" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const TONES: Record<ButtonTone, CSSProperties> = {
  // Deep navy at rest, lifting to the mid blue as the fill arrives.
  primary: { "--btn-bg": "#1A3D63", "--btn-fg": "#F6FAFD", "--btn-fill": "#4A7FA7", "--btn-fg-hover": "#FFFFFF" },
  // For the navy panels (the side rail, the device-check card), where a navy
  // button would disappear into its own background.
  onDark: { "--btn-bg": "#F6FAFD", "--btn-fg": "#0A1931", "--btn-fill": "#4A7FA7", "--btn-fg-hover": "#FFFFFF" },
  soft: { "--btn-bg": "#E3EDF7", "--btn-fg": "#1A3D63", "--btn-fill": "#1A3D63", "--btn-fg-hover": "#F6FAFD" },
  ghost: { "--btn-bg": "transparent", "--btn-fg": "#4A7FA7", "--btn-fill": "#1A3D63", "--btn-fg-hover": "#F6FAFD" },
} as Record<ButtonTone, CSSProperties>;

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-2 text-[13px]",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-[15px]",
};

const base = "btn-wipe inline-flex items-center justify-center gap-2 font-semibold";

function classes(tone: ButtonTone, size: ButtonSize, className: string) {
  // A ghost button has no surface of its own, so it shouldn't cast a shadow
  // until the fill gives it one.
  const flat = tone === "ghost" ? "shadow-none" : "";
  return `${base} ${SIZES[size]} ${flat} ${className}`.trim();
}

type Common = { tone?: ButtonTone; size?: ButtonSize; className?: string; children: ReactNode };

export function Button({
  tone = "primary",
  size = "md",
  className = "",
  style,
  ...p
}: Common & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} style={{ ...TONES[tone], ...style }} className={classes(tone, size, className)} />;
}
