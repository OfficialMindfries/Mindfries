import { Caveat } from "next/font/google";

/**
 * The handwriting on the sticky notes.
 *
 * Caveat, because it stays legible at the sizes a dashboard needs — most
 * script faces turn into texture below about 20px. It's still only used for
 * what someone would actually scrawl on a note: a headline, a number, a
 * label. The small print on each note stays in the UI sans, because a
 * deadline you can't read at a glance isn't doing its job.
 */
export const hand = Caveat({
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
});
