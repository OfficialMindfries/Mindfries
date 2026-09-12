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
 * exactly the same way and share one Start/Resume implementation rather than
 * two that could drift apart.
 *
 * Every button still goes somewhere: Start begins the onboarding wizard,
 * Resume is a real link into the workspace, Submitted shows its state rather
 * than a button wired to nothing. See AssessmentNotes for the fuller
 * rationale — it hasn't moved, only the rendering has.
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

        {/* A plain <a>, not a Link: entering the workspace is a full page load
            on purpose, so the IDE starts from a clean slate. */}
        {status === "in-progress" && (
          <a
            href="/ide"
            className="btn-wipe inline-flex shrink-0 items-center justify-center gap-1 px-3.5 py-2 text-[12.5px] font-semibold"
            style={{ "--btn-bg": "#0A1931", "--btn-fg": "#F6FAFD", "--btn-fill": "#4A7FA7", "--btn-fg-hover": "#FFFFFF" } as React.CSSProperties}
          >
            Resume
            <ArrowRight size={13} />
          </a>
        )}

        {status === "submitted" && (
          <span className={clsx(hand.className, "shrink-0 text-[19px] leading-none font-bold text-[#1A3D63]")}>
            under review ✓
          </span>
        )}
      </div>
    </StickyNote>
  );
}
