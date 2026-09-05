import { CheckCircle2, Mail, PlayCircle, Repeat } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { stats } from "@/lib/dashboard/data";

/**
 * Eightfold's signature row of counters, with one change that matters.
 *
 * Theirs shows a bare number, and a dash when there's nothing — "Interviews
 * —" tells you nothing you can act on. Each tile here carries a line of
 * context under the count, so a zero still says something useful and a one
 * says what to do about it.
 */

const ICONS: LucideIcon[] = [Mail, PlayCircle, CheckCircle2, Repeat];

export function StatTiles() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat, index) => {
        const Icon = ICONS[index];
        return (
          <div
            key={stat.label}
            className="rounded-2xl border border-[#B3CFE5] bg-white p-4 transition-shadow hover:shadow-[0_1px_16px_rgba(10,25,49,0.06)]"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#B3CFE5]/40 text-[#1A3D63]">
                <Icon size={15} />
              </span>
              <span className="text-[13px] font-medium text-[#1A3D63]">{stat.label}</span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-[#0A1931] tabular-nums">
              {stat.value}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[#4A7FA7]">{stat.hint}</p>
          </div>
        );
      })}
    </div>
  );
}
