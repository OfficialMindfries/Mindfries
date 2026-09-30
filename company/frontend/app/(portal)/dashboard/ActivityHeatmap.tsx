import { DAY, perBucket } from "@/lib/overview";

const DAYS = 91; // 13 weeks
const CELL = 11;
const GAP = 3;

// Sequential, one hue, light → dark (dataviz skill's color-formula for
// magnitude) — steps of the product's own accent violet rather than a
// second palette, same rationale as everywhere else in this app.
const LEVELS = ["var(--color-surface-2)", "rgba(124,58,237,0.18)", "rgba(124,58,237,0.4)", "rgba(124,58,237,0.65)", "rgba(124,58,237,0.95)"];
function levelFor(count: number, max: number): string {
  if (count === 0 || max === 0) return LEVELS[0];
  const step = Math.min(4, Math.ceil((count / max) * 4));
  return LEVELS[Math.max(1, step)];
}

/**
 * GitHub-style contribution heatmap of invite activity, last 13 weeks —
 * real, from candidate_applications.createdAt. Weeks run in real calendar
 * columns (Sunday-first rows), not just sequential day buckets, so the grid
 * reads as an actual calendar rather than an arbitrary strip.
 */
export function ActivityHeatmap({ createdAtDates, asOf }: { createdAtDates: string[]; asOf: Date }) {
  const counts = perBucket(createdAtDates, asOf, DAYS, DAY);
  const max = Math.max(...counts, 0);

  // UTC throughout — grid alignment and label must agree on which weekday
  // a bucket falls on, and picking one fixed zone (rather than the
  // server's local one) keeps that agreement independent of where this
  // happens to run.
  const dates = counts.map((_, i) => new Date(asOf.getTime() - (DAYS - 1 - i) * DAY));
  const leadingBlanks = dates[0].getUTCDay(); // 0 = Sunday
  const cells: { date: Date | null; count: number }[] = [
    ...Array.from({ length: leadingBlanks }, () => ({ date: null, count: 0 })),
    ...dates.map((date, i) => ({ date, count: counts[i] })),
  ];
  const weeks = Math.ceil(cells.length / 7);

  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div className="p-5">
      {max === 0 ? (
        <div className="flex h-28 items-center justify-center text-sm text-faint">No invite activity yet</div>
      ) : (
        <div
          className="inline-grid"
          style={{ gridTemplateColumns: `repeat(${weeks}, ${CELL}px)`, gridTemplateRows: `repeat(7, ${CELL}px)`, gridAutoFlow: "column", gap: GAP }}
        >
          {cells.map((cell, i) =>
            cell.date ? (
              <div key={i} className="rounded-[3px]" style={{ width: CELL, height: CELL, background: levelFor(cell.count, max) }} title={`${fmt(cell.date)}: ${cell.count} invited`} />
            ) : (
              <div key={i} style={{ width: CELL, height: CELL }} />
            ),
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-1.5 text-xs text-faint">
        <span>Less</span>
        {LEVELS.map((bg, i) => (
          <span key={i} className="rounded-[3px]" style={{ width: CELL, height: CELL, background: bg }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
