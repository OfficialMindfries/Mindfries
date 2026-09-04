import { FileText, Inbox, Repeat, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { activity, type ActivityEntry } from "@/lib/dashboard/data";

/**
 * Mercor's application rows, carrying what this product is actually about.
 *
 * Theirs lists a job title and a status pill. That's the right shape, but for
 * an evidence-based assessment the interesting line is the second one: the
 * session that produced the evidence, and what was in it. So each row leads
 * with the event and backs it with the specifics — how long, how many commits,
 * how many tests — because that's the thing a candidate is being read on.
 */

const ICONS: Record<ActivityEntry["kind"], LucideIcon> = {
  session: Terminal,
  report: FileText,
  invite: Inbox,
  practice: Repeat,
};

export function ActivityFeed() {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-base font-semibold tracking-tight text-[#0A1931]">Recent activity</h2>
        <button
          type="button"
          className="ml-auto text-[13px] font-medium text-[#4A7FA7] transition-colors hover:text-[#1A3D63]"
        >
          See all
        </button>
      </div>

      <ol className="overflow-hidden rounded-2xl border border-[#B3CFE5] bg-white">
        {activity.map((entry, index) => {
          const Icon = ICONS[entry.kind];
          return (
            <li
              key={entry.id}
              className={
                index > 0
                  ? "flex gap-3 border-t border-[#B3CFE5]/70 px-4 py-3.5 transition-colors hover:bg-[#B3CFE5]/15"
                  : "flex gap-3 px-4 py-3.5 transition-colors hover:bg-[#B3CFE5]/15"
              }
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#B3CFE5]/40 text-[#1A3D63]">
                <Icon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] leading-snug font-medium text-[#0A1931]">
                  {entry.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#4A7FA7]">{entry.detail}</p>
              </div>
              <span className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-[#4A7FA7]">
                {entry.when}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
