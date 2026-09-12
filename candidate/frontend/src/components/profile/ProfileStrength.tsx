"use client";

import { Check } from "lucide-react";
import clsx from "clsx";
import { bio, skills } from "@/lib/profile/data";
import { useProfileExtras } from "@/lib/profile/storage";
import { PLATFORM_ORDER, PLATFORMS } from "@/lib/profile/links";

/**
 * One number for how complete this profile is — the same kind of signal the
 * assessment notes already show as "92% match", turned around to describe
 * the candidate's own profile instead of a role.
 *
 * It's a checklist, not a black box: every factor behind the percentage is
 * named right below it, because a mystery score would work against the
 * product's whole premise — the PRD's own line is that the system should
 * show its work, not just render a verdict.
 */
export function ProfileStrength() {
  const { resume, links } = useProfileExtras();

  const items = [
    { label: "About you", done: bio.trim().length > 0 },
    { label: "Skills", done: skills.some((g) => g.items.length > 0) },
    { label: "Resume", done: !!resume },
    ...PLATFORM_ORDER.map((id) => ({ label: PLATFORMS[id].label, done: !!links[id] })),
  ];

  const done = items.filter((i) => i.done).length;
  const pct = Math.round((done / items.length) * 100);

  return (
    <section className="rounded-2xl border border-[#B3CFE5] bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#0A1931]">Profile strength</h2>
        <span className="text-sm font-semibold tabular-nums text-[#1A3D63]">{pct}%</span>
      </div>

      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#B3CFE5]/40">
        <div
          className="h-full rounded-full bg-[#1A3D63] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5 text-[12.5px]">
            <span
              className={clsx(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                item.done ? "bg-[#1A9E6B] text-white" : "border border-[#B3CFE5] bg-white"
              )}
            >
              {item.done && <Check size={10} strokeWidth={3} />}
            </span>
            <span className={item.done ? "text-[#0A1931]" : "text-[#4A7FA7]"}>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
