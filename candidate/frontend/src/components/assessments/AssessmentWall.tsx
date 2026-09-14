"use client";

import { useTransition } from "react";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { statusLabels, type Assessment } from "@/lib/dashboard/data";
import { hand } from "@/lib/dashboard/fonts";
import { startAssessment } from "@/app/dashboard/actions";
import { StickyNote } from "@/components/dashboard/StickyNote";
import { TONE } from "@/components/dashboard/noteTones";

/**
 * The note-wall grid, shared by the dashboard's preview and the full
 * Assessments page — moved out of AssessmentNotes so both render assessments
 * exactly the same way and share one Start implementation rather than two
 * that could drift apart.
 *
 * Every button still goes somewhere: Start begins the onboarding wizard;
 * Submitted shows its state rather than a button wired to nothing.
 * In-progress has no action at all — deliberately: nothing lets a candidate
 * re-enter a session once it's underway (see the "in-progress" case below
 * for why), so there's nothing honest to link it to. See AssessmentNotes for
 * the fuller rationale — it hasn't moved, only the rendering has.
 */
export function AssessmentWall({
  items,
  emptyTitle = "Nothing pinned here yet",
  emptyBody = "Assessments you're invited to will show up on this wall.",
}: {
  items: Assessment[];
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const [pending, start] = useTransition();

  if (items.length === 0) {
    return (
      <div className="max-w-xs">
        <StickyNote tone="lavender" index={0}>
          <p className={clsx(hand.className, "text-[26px] leading-tight font-bold")}>{emptyTitle}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#1A3D63]">{emptyBody}</p>
        </StickyNote>
      </div>
    );
  }

  return (
    <div className="grid gap-x-6 gap-y-9 pt-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((assessment, index) => (
        <AssessmentNote
          key={assessment.id}
          assessment={assessment}
          index={index}
          pending={pending}
          onStart={() => start(() => startAssessment(assessment.id))}
        />
      ))}
    </div>
  );
}

function AssessmentNote({
  assessment,
  index,
  pending,
  onStart,
}: {
  assessment: Assessment;
  index: number;
  pending: boolean;
  onStart: () => void;
}) {
  const { status } = assessment;

  return (
    <StickyNote tone={TONE[status]} index={index} faded={status === "closed"} className="min-h-[232px]">
      <div className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.08em] text-[#1A3D63] uppercase">
        <span>{statusLabels[status]}</span>
        {assessment.match !== undefined && (
          <span className="ml-auto tracking-normal normal-case">{assessment.match}% match</span>
        )}
      </div>

      <h3 className={clsx(hand.className, "mt-2 text-[27px] leading-[1.05] font-bold")}>
        {assessment.role}
      </h3>

      <p className="mt-2 text-[13px] text-[#1A3D63]">
        {assessment.company} · {assessment.location}
      </p>
      <p className="mt-1 text-xs text-[#1A3D63]/80">{assessment.tags.join(" · ")}</p>

      {/* Pinned to the bottom, so the actions line up across a row even when
          one role's name wraps to two lines and its neighbour's doesn't. */}
      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <span className="text-xs text-[#1A3D63]">{assessment.due}</span>

        {status === "invited" && (
          <Button
            type="button"
            size="sm"
            onClick={onStart}
            disabled={pending}
            className="shrink-0"
            style={{ "--btn-bg": "#0A1931" } as React.CSSProperties}
          >
            {pending ? "Starting…" : "Start"}
            {!pending && <ArrowRight size={13} />}
          </Button>
        )}

        {/* No "Resume": a session, once underway, can't be re-entered — see
            candidate.go's handleSubmit/handlePostEvents and task.md's
            "Sandbox, codebases, and session integrity" for why re-entry is
            deliberately not offered rather than pointed at a session that
            (today) has nothing stopping it from being replayed. The status
            chip above is the only thing shown for this state. */}

        {status === "submitted" && (
          <span className={clsx(hand.className, "shrink-0 text-[19px] leading-none font-bold text-[#1A3D63]")}>
            under review ✓
          </span>
        )}
      </div>
    </StickyNote>
  );
}
