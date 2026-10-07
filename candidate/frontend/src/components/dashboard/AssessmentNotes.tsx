import Link from "next/link";
import { AssessmentWall } from "@/components/assessments/AssessmentWall";
import { sortByAttention, type Assessment } from "@/lib/dashboard/data";

const PREVIEW_COUNT = 3;

/** Shown when the list couldn't be read — distinct from a real, empty list. */
export const UNAVAILABLE = {
  title: "Assessments unavailable",
  body: "We couldn't load your assessments just now. Nothing is lost — try again in a moment.",
};

/**
 * Assessments, pinned to the wall as notes — the dashboard's preview of the
 * full list at /assessments. `items` are the candidate's real assessments;
 * `undefined` means they couldn't be read at all, which is said plainly
 * rather than filled in.
 *
 * Shows the three most worth acting on (an open invitation before a session
 * already submitted) rather than the whole wall, so this section doesn't
 * compete with SetupCard and ActivityFeed for the page. "View all" only
 * appears when there's more to see.
 *
 * The note rendering itself — including what each button does — lives in
 * AssessmentWall, shared with the full Assessments page.
 */
export function AssessmentNotes({ items: loaded }: { items?: Assessment[] }) {
  const items = loaded ?? [];
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

      <AssessmentWall
        items={preview}
        emptyTitle={loaded ? undefined : UNAVAILABLE.title}
        emptyBody={loaded ? undefined : UNAVAILABLE.body}
      />
    </section>
  );
}
