import Link from "next/link";
import { Briefcase, UserPlus } from "lucide-react";
import { ago } from "@/lib/overview";
import type { CandidateApplicationWithRole } from "@/lib/db";
import type { JobRole } from "@/lib/types";

type Item =
  | { kind: "role"; at: string; role: JobRole }
  | { kind: "invite"; at: string; application: CandidateApplicationWithRole };

const LIMIT = 8;

/**
 * Recent role creations and candidate invites, merged and sorted by time —
 * PRD §1.4's Overview O5 "Recent Activity", left outstanding since Phase 1
 * (IMPLEMENTATION.md §11). No dedicated event log exists yet, so this is
 * derived from the two things that already carry a real created_at, not a
 * synthesized activity_events read — an accurate feed of "what happened,"
 * just not a complete one (stage changes aren't logged as events, only as
 * current state, so they don't show up here).
 */
export function ActivityFeed({ roles, applications }: { roles: JobRole[]; applications: CandidateApplicationWithRole[] }) {
  const items: Item[] = [
    ...roles.map((role): Item => ({ kind: "role", at: role.createdAt, role })),
    ...applications.map((application): Item => ({ kind: "invite", at: application.createdAt, application })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, LIMIT);

  const asOf = new Date();

  if (items.length === 0) {
    return <div className="flex h-28 items-center justify-center p-5 text-sm text-faint">No activity yet</div>;
  }

  return (
    <ul className="divide-y divide-hair">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-3.5 px-6 py-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            {item.kind === "role" ? <Briefcase size={16} strokeWidth={2.1} /> : <UserPlus size={16} strokeWidth={2.1} />}
          </span>
          <div className="min-w-0 flex-1">
            {item.kind === "role" ? (
              <Link href={`/roles/${item.role.id}`} className="truncate text-sm font-medium hover:underline">
                Created role <span className="font-bold">{item.role.title}</span>
              </Link>
            ) : (
              <Link href={`/candidates/${item.application.id}`} className="truncate text-sm font-medium hover:underline">
                Invited <span className="font-bold">{item.application.candidateName ?? item.application.candidateEmail}</span> to{" "}
                {item.application.roleTitle}
              </Link>
            )}
          </div>
          <span className="shrink-0 text-xs text-faint">{ago(item.at, asOf)}</span>
        </li>
      ))}
    </ul>
  );
}
