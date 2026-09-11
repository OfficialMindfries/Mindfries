import { TEAM_TZ } from "@/lib/team-time";

/**
 * "Sample data · as of …" — on every page that's showing fixtures rather than
 * live records, because the figures on these cards look exactly like real
 * ones and would otherwise be read as real.
 */
export function SampleBadge({ asOf }: { asOf: Date }) {
  const when = asOf.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TEAM_TZ });
  return (
    <span
      title="These figures come from the sample fixtures in lib/mock-data, measured as of the sample's snapshot — not live data."
      className="inline-flex items-center gap-2 rounded-full border border-hair bg-surface px-3.5 py-2 text-xs font-semibold text-dim"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#d97706]" aria-hidden />
      Sample data · as of {when}
    </span>
  );
}
