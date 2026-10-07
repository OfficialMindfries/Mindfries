"use client";

import { useTransition } from "react";
import clsx from "clsx";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { statusLabels, type Assessment } from "@/lib/dashboard/data";
import { hand } from "@/lib/dashboard/fonts";
import { startAssessment } from "@/app/dashboard/actions";
import { StickyNote } from "@/components/dashboard/StickyNote";
import { TONE } from "@/components/dashboard/noteTones";
import { InvitationAnswer } from "./InvitationAnswer";

/**
 * The note-wall grid, shared by the dashboard's preview and the full
 * Assessments page — moved out of AssessmentNotes so both render assessments
 * exactly the same way and share one Start implementation rather than two
 * that could drift apart.
 *
 * Every button goes somewhere. A company's invitation asks to be accepted
 * or declined first (InvitationAnswer); once accepted — and for an
 * open-pool assessment straight away — Start begins the onboarding wizard.
 * In-progress resumes the session, and Submitted opens its report.
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
  const { status, invitation } = assessment;
  // A company's invitation the candidate hasn't answered yet: it asks for
  // an answer before it offers Start.
  const unanswered = status === "invited" && !!invitation && !invitation.accepted;

  return (
    <StickyNote tone={TONE[status]} index={index} faded={status === "closed"} className="min-h-[232px]">
      <div className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.08em] text-[#1A3D63] uppercase">
        <span>{invitation?.declined ? "Declined" : status === "invited" && invitation?.accepted ? "Accepted" : statusLabels[status]}</span>
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
        {!unanswered && <span className="text-xs text-[#1A3D63]">{assessment.due}</span>}
        {unanswered && <span className="self-start text-xs text-[#1A3D63]">{assessment.due}</span>}

        {unanswered && <InvitationAnswer assessmentId={assessment.id} />}

        {status === "invited" && !unanswered && (
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

        {/* A session under way can be picked up again. Nothing is gained by
            leaving and coming back: the clock is the server's and kept
            running, the work is the copy the server holds (or this
            browser's, if newer), and once the interview has begun the
            workspace opens on the interview with the code frozen. */}
        {status === "in-progress" && assessment.sessionId && (
          <Link
            href={`/ide?session=${encodeURIComponent(assessment.sessionId)}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#0A1931] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Resume <ArrowRight size={13} />
          </Link>
        )}

        {status === "submitted" &&
          (assessment.sessionId ? (
            <Link
              href={`/assessments/${encodeURIComponent(assessment.sessionId)}/report`}
              className={clsx(hand.className, "shrink-0 text-[19px] leading-none font-bold text-[#1A3D63] underline-offset-4 hover:underline")}
            >
              under review ✓
            </Link>
          ) : (
            <span className={clsx(hand.className, "shrink-0 text-[19px] leading-none font-bold text-[#1A3D63]")}>
              under review ✓
            </span>
          ))}
      </div>
    </StickyNote>
  );
}
