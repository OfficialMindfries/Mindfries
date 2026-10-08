import Link from "next/link";
import { FileText, Inbox, Repeat, Terminal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Assessment } from "@/lib/dashboard/data";

/**
 * Mercor's application rows, carrying what this product is actually about.
 *
 * Theirs lists a job title and a status pill. That's the right shape, but for
 * an evidence-based assessment the interesting line is the second one: the
 * session that produced the evidence, and what was in it. So each row leads
 * with the event and backs it with the specifics — how long, how many commits,
 * how many tests — because that's the thing a candidate is being read on.
 */

const ICONS: Record<string, LucideIcon> = {
  session: Terminal,
  report: FileText,
  invite: Inbox,
  practice: Repeat,
};

/** The feed is a glance; the full list is the Assessments page. */
const SHOWN = 5;

export function ActivityFeed({ items = [] }: { items?: Assessment[] }) {
  // Generate real activities from the user's assessments. Each row links to
  // the thing it's about, where there is one: the workspace to resume, or
  // the report.
  const all = items.map((a) => {
    if (a.status === "invited") {
      return { id: a.id, kind: "invite", title: `Invited to ${a.role}`, detail: `${a.company} · ${a.tags.join(", ")}`, when: a.due, href: "/assessments" };
    }
    if (a.status === "submitted" || a.status === "closed") {
      return {
        id: a.id, kind: a.sessionId ? "report" : "session", title: `Submitted ${a.role} assessment`, detail: a.company, when: a.due,
        href: a.sessionId ? `/assessments/${encodeURIComponent(a.sessionId)}/report` : "/assessments",
      };
    }
    return {
      id: a.id, kind: "session", title: `Started ${a.role} session`, detail: "In progress — pick it up where you left off", when: a.due,
      href: a.sessionId ? `/ide?session=${encodeURIComponent(a.sessionId)}` : "/assessments",
    };
  });
  const activity = all.slice(0, SHOWN);

  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-base font-semibold tracking-tight text-[#0A1931]">Recent activity</h2>
        {all.length > 0 && (
          <Link href="/assessments" className="ml-auto text-[13px] font-medium text-[#4A7FA7] transition-colors hover:text-[#1A3D63]">
            See all{all.length > SHOWN ? ` ${all.length}` : ""}
          </Link>
        )}
      </div>

      <ol className="overflow-hidden rounded-2xl border border-[#B3CFE5] bg-white">
        {activity.length === 0 ? (
          <li className="px-4 py-3.5 text-sm text-[#4A7FA7]">No recent activity.</li>
        ) : activity.map((entry, index) => {
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
                  <Link href={entry.href} className="underline-offset-2 hover:underline">
                    {entry.title}
                  </Link>
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
