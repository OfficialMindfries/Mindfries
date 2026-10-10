import clsx from "clsx";
import { hand } from "@/lib/dashboard/fonts";
import { type Assessment } from "@/lib/dashboard/data";
import { StickyNote } from "./StickyNote";
import { TONE } from "./noteTones";

interface StatNotesProps {
  /**
   * The same real-or-undefined list the dashboard passes to
   * `AssessmentNotes` — `undefined` when the candidate's records couldn't
   * be read at all, which counts as zero here; `AssessmentNotes` is where
   * that case is explained.
   */
  items?: Assessment[];
  /** Practice runs the candidate has opened (lib/setup-state.ts). */
  practiceRuns?: number;
}

export function StatNotes({ items, practiceRuns }: StatNotesProps) {
  const invited = items?.filter((a) => a.status === "invited").length ?? 0;
  const inProgress = items?.filter((a) => a.status === "in-progress").length ?? 0;
  const submitted = items?.filter((a) => a.status === "submitted").length ?? 0;

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-7 pt-2 lg:grid-cols-4">
      <StickyNote tone={TONE["invited"]} index={0}>
        <p className={clsx(hand.className, "text-[22px] leading-none font-medium")}>
          Open invitations
        </p>
        <p className={clsx(hand.className, "mt-2 text-[56px] leading-none font-bold tabular-nums")}>
          {invited}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[#1A3D63]">
          {invited === 0 ? "Nothing open right now" : `${invited} open right now`}
        </p>
      </StickyNote>
      <StickyNote tone={TONE["in-progress"]} index={1}>
        <p className={clsx(hand.className, "text-[22px] leading-none font-medium")}>
          In progress
        </p>
        <p className={clsx(hand.className, "mt-2 text-[56px] leading-none font-bold tabular-nums")}>
          {inProgress}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[#1A3D63]">
          {inProgress === 0 ? "Nothing in progress" : "Resume from your assessments"}
        </p>
      </StickyNote>
      <StickyNote tone={TONE["submitted"]} index={2}>
        <p className={clsx(hand.className, "text-[22px] leading-none font-medium")}>
          Submitted
        </p>
        <p className={clsx(hand.className, "mt-2 text-[56px] leading-none font-bold tabular-nums")}>
          {submitted}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[#1A3D63]">
          {submitted === 0 ? "Nothing submitted yet" : submitted === 1 ? "Under review" : "All under review"}
        </p>
      </StickyNote>
    </div>
  );
}