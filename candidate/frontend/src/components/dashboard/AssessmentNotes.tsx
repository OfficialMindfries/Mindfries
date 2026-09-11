"use client";

import { useTransition } from "react";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { assessments as sample, statusLabels, type Assessment } from "@/lib/dashboard/data";
import { hand } from "@/lib/dashboard/fonts";
import { startAssessment } from "@/app/dashboard/actions";
import { StickyNote } from "./StickyNote";
import { TONE } from "./noteTones";

/**
 * Assessments, pinned to the wall as notes.
 *
 * A wall rather than the old carousel: five things don't need to hide behind
 * arrows, and a wall is the point of the metaphor. `items` are the
 * candidate's real assessments when Supabase is configured, and the sample
 * set otherwise — the same fallback the carousel had.
 *
 * ## Every button goes somewhere
 *
 * The old cards had three buttons and only one of them did anything. "Resume
 * session" and "View your report" were wired to nothing, which is worse than
 * having no button: it's a promise the page doesn't keep. So:
 *
 * - **Start assessment** runs `startAssessment`, which takes the candidate
 *   into `/onboarding` — consent, device check, lobby — before any session or
 *   timer starts.
 * - **Resume** is a link to `/ide`. The workspace restores itself from
 *   browser storage, so it genuinely does open where they left off.
 * - **Submitted** shows its state instead of a button, because there's no
 *   report page yet. That comes back as a link when there's something to
 *   link to.
 */
export function AssessmentNotes({ items = sample }: { items?: Assessment[] }) {
  const [pending, start] = useTransition();

  return (
    <section>
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="text-base font-semibold tracking-tight text-[#0A1931]">Your assessments</h2>
        <span className="text-[13px] text-[#4A7FA7] tabular-nums">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className="max-w-xs">
          <StickyNote tone="lavender" index={0}>
            <p className={clsx(hand.className, "text-[26px] leading-tight font-bold")}>
              Nothing pinned here yet
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#1A3D63]">
              Assessments you&apos;re invited to will show up on this wall.
            </p>
          </StickyNote>
        </div>
      ) : (
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
      )}
    </section>
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
          <button
            type="button"
            onClick={onStart}
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#0A1931] px-3 py-1.5 text-[12.5px] font-medium text-[#F6FAFD] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Starting…" : "Start"}
            {!pending && <ArrowRight size={13} />}
          </button>
        )}

        {status === "in-progress" && (
          <a
            href="/ide"
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#0A1931] px-3 py-1.5 text-[12.5px] font-medium text-[#F6FAFD] transition-opacity hover:opacity-90"
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
