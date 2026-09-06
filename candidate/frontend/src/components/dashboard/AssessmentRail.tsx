"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import clsx from "clsx";
import { assessments as mock, statusLabels, type Assessment, type AssessmentStatus } from "@/lib/dashboard/data";
import { startAssessment } from "@/app/dashboard/actions";

/**
 * Eightfold's "Recommended jobs" carousel, rebuilt for assessments.
 *
 * `items` are the candidate's real assessments once the backend is connected;
 * it falls back to sample data so the rail still renders pre-wiring. "Start
 * assessment" creates a live session (seen in the internal-admin monitor) and
 * enters the workspace.
 */

const EDGE_SLACK = 8;
const GAP = 12;

const STATUS_STYLE: Record<AssessmentStatus, { dot: string; chip: string }> = {
  invited: { dot: "bg-[#4A7FA7]", chip: "bg-[#B3CFE5]/40 text-[#1A3D63]" },
  "in-progress": { dot: "bg-[#C98A2E]", chip: "bg-[#C98A2E]/15 text-[#8A5D14]" },
  submitted: { dot: "bg-[#3E8E6E]", chip: "bg-[#3E8E6E]/15 text-[#2C6650]" },
  closed: { dot: "bg-[#B3CFE5]", chip: "bg-[#B3CFE5]/30 text-[#4A7FA7]" },
};

const ACTION: Record<AssessmentStatus, string | null> = {
  invited: "Start assessment",
  "in-progress": "Resume session",
  submitted: "View your report",
  closed: null,
};

export function AssessmentRail({ items = mock }: { items?: Assessment[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [pending, start] = useTransition();

  const measure = useCallback((position?: number) => {
    const element = scroller.current;
    if (!element) return;
    const scrollLeft = position ?? element.scrollLeft;
    const max = element.scrollWidth - element.clientWidth;
    setAtStart(scrollLeft <= EDGE_SLACK);
    setAtEnd(scrollLeft >= max - EDGE_SLACK);
  }, []);

  useEffect(() => {
    measure();
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  const page = (direction: -1 | 1) => {
    const element = scroller.current;
    if (!element) return;
    const card = element.querySelector("article");
    const step = card ? card.clientWidth + GAP : element.clientWidth * 0.8;
    const max = element.scrollWidth - element.clientWidth;
    const target = Math.max(0, Math.min(max, element.scrollLeft + direction * step));
    element.scrollLeft = target;
    measure(target);
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-base font-semibold tracking-tight text-[#0A1931]">Your assessments</h2>
        <span className="rounded-full bg-[#B3CFE5]/40 px-2 py-0.5 text-[11px] font-medium text-[#1A3D63] tabular-nums">
          {items.length}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <RailButton label="Scroll left" disabled={atStart} onClick={() => page(-1)}>
            <ChevronLeft size={16} />
          </RailButton>
          <RailButton label="Scroll right" disabled={atEnd} onClick={() => page(1)}>
            <ChevronRight size={16} />
          </RailButton>
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={() => measure()}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((assessment) => (
          <AssessmentCard
            key={assessment.id}
            assessment={assessment}
            pending={pending}
            onStart={() => start(() => startAssessment(assessment.id))}
          />
        ))}
        {items.length === 0 && (
          <p className="px-1 py-6 text-sm text-[#4A7FA7]">No assessments yet — check back once you&apos;re invited.</p>
        )}
      </div>
    </section>
  );
}

function RailButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
        disabled
          ? "cursor-not-allowed border-[#B3CFE5]/60 text-[#B3CFE5]"
          : "border-[#B3CFE5] text-[#1A3D63] hover:bg-[#B3CFE5]/30"
      )}
    >
      {children}
    </button>
  );
}

function AssessmentCard({
  assessment,
  onStart,
  pending,
}: {
  assessment: Assessment;
  onStart: () => void;
  pending: boolean;
}) {
  const style = STATUS_STYLE[assessment.status];
  const action = ACTION[assessment.status];

  return (
    <article className="flex w-[268px] shrink-0 snap-start flex-col rounded-2xl border border-[#B3CFE5] bg-white p-4 transition-shadow hover:shadow-[0_2px_20px_rgba(10,25,49,0.07)]">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[15px] leading-snug font-semibold text-[#0A1931]">
          {assessment.role}
        </h3>
        <span
          className={clsx(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase",
            style.chip
          )}
        >
          {statusLabels[assessment.status]}
        </span>
      </div>

      <p className="mt-1 text-[13px] text-[#1A3D63]">{assessment.company}</p>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-[#4A7FA7]">
        <MapPin size={12} className="shrink-0" />
        {assessment.location}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {assessment.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-[#B3CFE5]/30 px-2 py-1 text-[11px] text-[#1A3D63]"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-4">
        <div className="flex items-center gap-2 border-t border-[#B3CFE5]/70 pt-3 text-xs">
          <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", style.dot)} />
          <span className="text-[#4A7FA7]">
            {assessment.match !== undefined ? `${assessment.match}% match` : assessment.due}
          </span>
          {assessment.match !== undefined && (
            <span className="ml-auto text-[#4A7FA7]">{assessment.due}</span>
          )}
        </div>

        {action && (
          <button
            type="button"
            onClick={assessment.status === "invited" ? onStart : undefined}
            disabled={assessment.status === "invited" && pending}
            className={clsx(
              "mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50",
              assessment.status === "submitted"
                ? "border border-[#B3CFE5] text-[#1A3D63]"
                : "bg-[#4A7FA7] text-[#F6FAFD]"
            )}
          >
            {assessment.status === "invited" && pending ? "Starting…" : action}
            <ArrowRight size={13} />
          </button>
        )}
      </div>
    </article>
  );
}
