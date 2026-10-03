"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Pill } from "@/components/ui";
import { fmtDate, stageLabel, stageTone } from "@/lib/format";
import { bulkChangeStage, changeStage } from "./actions";
import type { ApplicationStage, CandidateApplication } from "@/lib/types";

// The three moves a company actually makes by hand — any stage to any of
// these, not a strict state machine. Everything else (invited → in_progress
// → completed) is the candidate's own progress through the assessment.
const STAGE_ACTIONS: { stage: ApplicationStage; label: string; variant: "primary" | "danger" | "soft" }[] = [
  { stage: "shortlisted", label: "Shortlist", variant: "soft" },
  { stage: "hired", label: "Hire", variant: "primary" },
  { stage: "rejected", label: "Reject", variant: "danger" },
];

export function PipelineList({
  roleId,
  applications,
  canChangeStage,
}: {
  roleId: string;
  applications: CandidateApplication[];
  canChangeStage: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = applications.length > 0 && selected.size === applications.length;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(applications.map((a) => a.id)));
  }

  return (
    // No default `action` — every submit goes through a button's own
    // formAction (per-row changeStage, or the bulk bar's bulkChangeStage),
    // which is the standard way to put several server actions on one form.
    <form className="hair-card divide-y divide-hair">
      {canChangeStage && (
        <div className="flex flex-wrap items-center gap-3 bg-surface-2/40 px-6 py-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-dim">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            {selected.size > 0 ? `${selected.size} selected` : "Select all"}
          </label>
          {selected.size > 0 && (
            <div className="ml-auto flex gap-1.5">
              {STAGE_ACTIONS.map((sa) => (
                <Button
                  key={sa.stage}
                  type="submit"
                  size="sm"
                  variant={sa.variant}
                  formAction={bulkChangeStage.bind(null, roleId, sa.stage)}
                  className="!px-3 !py-1.5 !text-[12px]"
                >
                  {sa.label} ({selected.size})
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {applications.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-4 px-6 py-3.5">
          {canChangeStage && (
            <input
              type="checkbox"
              name="applicationIds"
              value={a.id}
              checked={selected.has(a.id)}
              onChange={() => toggleOne(a.id)}
              aria-label={`Select ${a.candidateName ?? a.candidateEmail}`}
            />
          )}
          <Link href={`/candidates/${a.id}`} className="min-w-0 flex-1 hover:underline">
            <div className="truncate text-sm font-bold">{a.candidateName ?? a.candidateEmail}</div>
            <div className="truncate text-xs text-dim">{a.candidateEmail}</div>
          </Link>
          <Pill tone={stageTone[a.stage]}>{stageLabel[a.stage]}</Pill>
          {a.score != null && <span className="mono text-sm text-dim">{a.score}%</span>}
          <span className="text-xs text-faint">{fmtDate(a.createdAt)}</span>

          {canChangeStage && (
            <div className="flex shrink-0 gap-1.5">
              {STAGE_ACTIONS.filter((sa) => sa.stage !== a.stage).map((sa) => (
                <Button
                  key={sa.stage}
                  type="submit"
                  size="sm"
                  variant={sa.variant}
                  formAction={changeStage.bind(null, roleId, a.id, sa.stage)}
                  className="!px-3 !py-1.5 !text-[12px]"
                >
                  {sa.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      ))}
    </form>
  );
}
