import { perBucket, sparkPaths, WEEK } from "@/lib/overview";

const WEEKS = 12;
const W = 640;
const H = 160;

/**
 * Candidates invited per week, last 12 weeks — real, from
 * candidate_applications.createdAt (dataviz skill: single series, no
 * legend needed; the title names it). Native <title> tooltips per point
 * stand in for a full crosshair — this app has no client-side chart
 * interaction anywhere yet, and a plain hover tooltip is the honest
 * minimum rather than skipping the hover layer entirely.
 */
export function TrendChart({ createdAtDates, asOf }: { createdAtDates: string[]; asOf: Date }) {
  const values = perBucket(createdAtDates, asOf, WEEKS, WEEK);
  const { line, area } = sparkPaths(values, W, H, 6);
  const total = values.reduce((a, b) => a + b, 0);

  const weekStart = (i: number) => new Date(asOf.getTime() - (WEEKS - 1 - i) * WEEK);
  const fmtWeek = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div className="p-5">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tracking-tight">{total}</span>
        <span className="text-sm text-dim">invited in the last {WEEKS} weeks</span>
      </div>

      {total === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-faint">No invites yet</div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Candidates invited per week" className="h-32 w-full overflow-visible">
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* baseline */}
            <line x1="0" y1={H - 6} x2={W} y2={H - 6} stroke="var(--color-hair)" strokeWidth="1" />
            <path d={area} fill="url(#trend-fill)" />
            <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {values.map((v, i) => {
              const x = (i / (WEEKS - 1)) * W;
              const max = Math.max(...values, 1);
              const y = H - 6 - (v / max) * (H - 12);
              return (
                <circle key={i} cx={x} cy={y} r={3.5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth="1.5">
                  <title>
                    {fmtWeek(weekStart(i))}: {v} invited
                  </title>
                </circle>
              );
            })}
          </svg>
          <div className="mt-1.5 flex justify-between text-xs text-faint">
            <span>{fmtWeek(weekStart(0))}</span>
            <span>{fmtWeek(weekStart(WEEKS - 1))}</span>
          </div>
        </>
      )}
    </div>
  );
}
