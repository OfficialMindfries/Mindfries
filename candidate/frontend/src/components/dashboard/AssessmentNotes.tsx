import Link from "next/link";
import { AssessmentWall } from "@/components/assessments/AssessmentWall";
import { assessments as sample, sortByAttention, type Assessment } from "@/lib/dashboard/data";

const PREVIEW_COUNT = 3;

/**
 * Assessments, pinned to the wall as notes — the dashboard's preview of the
 * full list at /assessments. `items` are the candidate's real assessments
 * when Supabase is configured, and the sample set otherwise.
 *
 * Shows the three most worth acting on (an open invitation before a session
 * already submitted) rather than the whole wall, so this section doesn't
 * compete with SetupCard and ActivityFeed for the page. "View all" only
 * appears when there's more to see.
 *
 * The note rendering itself — including what each button does — lives in
 * AssessmentWall, shared with the full Assessments page.
 */
export function AssessmentNotes({ items = sample }: { items?: Assessment[] }) {
  const ordered = sortByAttention(items);
  const preview = ordered.slice(0, PREVIEW_COUNT);

  return (
    <section>
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="text-base font-semibold tracking-tight text-[#0A1931]">Your assessments</h2>
        <span className="text-[13px] text-[#4A7FA7] tabular-nums">{items.length}</span>
        {items.length > PREVIEW_COUNT && (
          <Link
            href="/assessments"
            className="ml-auto text-[13px] font-medium text-[#4A7FA7] transition-colors hover:text-[#1A3D63]"
          >
            View all →
          </Link>
        )}
      </div>

      <AssessmentWall items={preview} />
    </section>
  );
}
