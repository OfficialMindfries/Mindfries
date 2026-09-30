"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, Input, Pill } from "@/components/ui";
import { fmtDate, roleStatusTone, stageLabel, stageTone } from "@/lib/format";
import type { CandidateApplicationWithRole } from "@/lib/db";
import type { JobRole } from "@/lib/types";

type RoleBlock = {
  role: JobRole;
  candidates: CandidateApplicationWithRole[];
};

function matches(a: CandidateApplicationWithRole, query: string): boolean {
  const q = query.toLowerCase();
  return (
    (a.candidateName ?? "").toLowerCase().includes(q) ||
    a.candidateEmail.toLowerCase().includes(q) ||
    a.roleTitle.toLowerCase().includes(q)
  );
}

/**
 * Client-side search: the candidate list is small at this stage (MVP
 * volumes, per IMPLEMENTATION.md §6), so filtering in the browser as you
 * type is simpler and more responsive than a server round-trip per
 * keystroke — revisit if this ever needs to page.
 */
export function CandidatesBoard({ roles, applications }: { roles: JobRole[]; applications: CandidateApplicationWithRole[] }) {
  const [query, setQuery] = useState("");

  const blocks = useMemo<RoleBlock[]>(() => {
    const byRole = new Map<string, CandidateApplicationWithRole[]>();
    for (const a of applications) {
      if (query && !matches(a, query)) continue;
      const list = byRole.get(a.jobRoleId) ?? [];
      list.push(a);
      byRole.set(a.jobRoleId, list);
    }
    return roles
      .map((role) => ({ role, candidates: byRole.get(role.id) ?? [] }))
      .filter((b) => b.candidates.length > 0);
  }, [roles, applications, query]);

  return (
    <div className="space-y-6">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by candidate name, email, or role…"
        className="max-w-md"
      />

      {blocks.length === 0 ? (
        <EmptyState
          title={query ? `No candidates match "${query}"` : "No candidates yet"}
          hint={query ? undefined : "Candidates show up here once a role has invited someone."}
        />
      ) : (
        <div className="space-y-5">
          {blocks.map(({ role, candidates }) => (
            <div key={role.id} className="hair-card overflow-hidden">
              <Link
                href={`/roles/${role.id}`}
                className="flex flex-wrap items-center gap-3 border-b border-hair bg-surface-2/40 px-6 py-3.5 transition hover:bg-surface-2"
              >
                <span className="text-sm font-bold">{role.title}</span>
                <Pill tone={roleStatusTone[role.status]}>{role.status}</Pill>
                <span className="ml-auto text-xs text-dim">
                  {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
                </span>
              </Link>
              <div className="divide-y divide-hair">
                {candidates.map((a) => (
                  <Link
                    key={a.id}
                    href={`/candidates/${a.id}`}
                    className="flex flex-wrap items-center gap-4 px-6 py-3.5 transition hover:bg-black/[0.02]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{a.candidateName ?? a.candidateEmail}</div>
                      <div className="truncate text-xs text-dim">{a.candidateEmail}</div>
                    </div>
                    <Pill tone={stageTone[a.stage]}>{stageLabel[a.stage]}</Pill>
                    {a.score != null && <span className="mono text-sm text-dim">{a.score}%</span>}
                    <span className="text-xs text-faint">{fmtDate(a.createdAt)}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
