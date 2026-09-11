import clsx from "clsx";
import { stats } from "@/lib/dashboard/data";
import { hand } from "@/lib/dashboard/fonts";
import { StickyNote } from "./StickyNote";
import { TONE } from "./noteTones";

/**
 * The four counters, as notes.
 *
 * The number is the thing you'd write biggest on a real note, so it's the
 * largest thing here, in handwriting. The hint underneath stays in the UI
 * sans: it's the part that tells you what to do about the number, and it has
 * to be readable in one glance.
 */
export function StatNotes() {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-7 pt-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <StickyNote key={stat.label} tone={TONE[stat.kind]} index={index}>
          <p className={clsx(hand.className, "text-[22px] leading-none font-medium")}>
            {stat.label}
          </p>
          <p className={clsx(hand.className, "mt-2 text-[56px] leading-none font-bold tabular-nums")}>
            {stat.value}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#1A3D63]">{stat.hint}</p>
        </StickyNote>
      ))}
    </div>
  );
}
