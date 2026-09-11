import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";

/**
 * One sticky note, after brainwhite's wall: pastel paper, a strip of tape,
 * a slight tilt, and a lifted bottom corner.
 *
 * ## Colour means something here
 *
 * On brainwhite the paper colour is decoration — any note can be any colour.
 * On a dashboard that's wasted signal, so each tone is tied to a state and
 * used the same way everywhere: yellow is waiting on you, pink is underway,
 * green is done and out of your hands, blue is practice. Closed notes are
 * lavender and faded, the way an old note looks next to a fresh one.
 *
 * The papers are the one place the dashboard leaves the five-swatch brand
 * palette, because a wall of notes in five shades of navy wouldn't read as
 * notes at all. Everything *written on* them — text, buttons, icons — is
 * still in brand navy, which is also what keeps contrast high on pale paper.
 *
 * ## Tilt without the mess
 *
 * brainwhite's notes overlap. That's charming on a page whose whole purpose
 * is the wall, and a problem on one where every note is something to read and
 * a button to press — an overlapped deadline is a hidden deadline. So these
 * sit in a grid, each tilted a degree or two, and none of them cover another.
 *
 * The tilt comes from the note's position rather than `Math.random()`: it has
 * to render identically on the server and the client, or hydration throws.
 */

export type NoteTone = "yellow" | "pink" | "green" | "blue" | "lavender";

const PAPER: Record<NoteTone, string> = {
  yellow: "bg-[#FDF09B]",
  pink: "bg-[#F9CDE2]",
  green: "bg-[#BFF2D3]",
  blue: "bg-[#B3CFE5]",
  lavender: "bg-[#E2D6F8]",
};

/** Small, uneven, and never zero — a perfectly straight note looks placed by a machine. */
const TILTS = [-2.2, 1.6, -1.1, 2.4, -1.7, 1.2, -2.6, 0.9];
const LIFTS = [0, 6, -3, 4, -5, 2, 5, -2];

export function StickyNote({
  tone,
  index,
  faded = false,
  className,
  children,
}: {
  tone: NoteTone;
  /** Position in its row; picks a stable tilt and vertical offset. */
  index: number;
  faded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const style = {
    "--tilt": `${TILTS[index % TILTS.length]}deg`,
    "--lift": `${LIFTS[index % LIFTS.length]}px`,
  } as CSSProperties;

  return (
    <div
      style={style}
      className={clsx(
        "group relative flex flex-col px-5 pt-7 pb-5 text-[#0A1931]",
        PAPER[tone],
        // The lifted corner: a wide, shallow radius on one corner only reads
        // as paper curling off the wall, where an even radius reads as a UI
        // card with rounded corners.
        "rounded-[3px] [border-bottom-right-radius:48px_10px]",
        "shadow-[0_14px_20px_-12px_rgba(10,25,49,0.35),0_2px_5px_rgba(10,25,49,0.06)]",
        "[transform:translateY(var(--lift))_rotate(var(--tilt))]",
        // Straightens and lifts on hover — as if you'd reached up and pressed
        // it flat to read it. Skipped entirely under reduced motion.
        "motion-safe:transition-[transform,box-shadow] motion-safe:duration-200",
        "hover:[transform:translateY(-4px)_rotate(0deg)] hover:shadow-[0_22px_28px_-14px_rgba(10,25,49,0.4),0_3px_8px_rgba(10,25,49,0.08)]",
        "focus-within:[transform:translateY(-4px)_rotate(0deg)]",
        faded && "opacity-75",
        className
      )}
    >
      {/* Tape. Translucent white over the paper, so it takes on the note's
          colour the way real tape does, rather than being a grey bar. */}
      <span
        aria-hidden
        className="absolute top-0 left-1/2 h-5 w-16 -translate-x-1/2 -translate-y-1/2 rotate-[-3deg] rounded-[2px] bg-white/60 shadow-[0_1px_2px_rgba(10,25,49,0.12)]"
      />
      {children}
    </div>
  );
}
