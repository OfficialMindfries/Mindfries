// The numbers behind the Overview cards' sparklines and trend lines.
//
// Every series is computed from real timestamps on the records — when a
// company signed up, a game was created, a session started — never drawn to
// look good. A sparkline that isn't derived from anything is an invented
// analytic, and the Overview is exactly where the team would read it as fact.
//
// Pure and dependency-free, so it can be checked on its own:
// `npx --yes tsx lib/overview.test.mts`.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

/**
 * Running total at `points` evenly spaced moments ending at `asOf`: how many
 * of `dates` had happened by each one. Rises as things accumulate — the right
 * shape for "how many companies / games are there".
 */
export function cumulative(dates: string[], asOf: Date, points: number, step: number): number[] {
  const times = dates.map((d) => Date.parse(d)).filter((t) => !Number.isNaN(t));
  return Array.from({ length: points }, (_, i) => {
    const at = asOf.getTime() - (points - 1 - i) * step;
    return times.filter((t) => t <= at).length;
  });
}

/**
 * How many of `dates` fell in each of `points` consecutive buckets of `step`,
 * the last one ending at `asOf`. The right shape for activity: "session
 * starts per hour".
 */
export function perBucket(dates: string[], asOf: Date, points: number, step: number): number[] {
  const end = asOf.getTime();
  const start = end - points * step;
  const counts = new Array<number>(points).fill(0);
  for (const d of dates) {
    const t = Date.parse(d);
    if (Number.isNaN(t) || t <= start || t > end) continue;
    // Buckets are (start, end] like the window as a whole, so an event exactly
    // on a boundary belongs to the bucket that ends there — `ceil − 1`, not
    // `floor`, which would push it into the next one.
    counts[Math.min(points - 1, Math.max(0, Math.ceil((t - start) / step) - 1))]++;
  }
  return counts;
}

/** How many of `dates` fall within `window` before `asOf`. */
export function countWithin(dates: string[], asOf: Date, window: number): number {
  const end = asOf.getTime();
  return dates.filter((d) => {
    const t = Date.parse(d);
    return !Number.isNaN(t) && t <= end && t > end - window;
  }).length;
}

/** "just now", "25 min ago", "2 hours ago", "yesterday", "3 days ago", "2 weeks ago", "3 months ago". */
export function ago(iso: string, asOf: Date): string {
  const ms = asOf.getTime() - Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  if (ms < 2 * 60_000) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(ms / DAY);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/**
 * SVG path data for a sparkline: the line, and the same line closed down to
 * the baseline for the filled area under it. Smoothed with a Catmull-Rom
 * curve so a handful of points reads as a trend, not a staircase — but the
 * curve passes through every real point, so nothing is invented between them.
 */
export function sparkPaths(values: number[], width: number, height: number, pad = 3): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
    // A flat series sits low in the box rather than floating mid-air.
    const y = span === 0 ? height - pad - (height - 2 * pad) * 0.2 : height - pad - ((v - min) / span) * (height - 2 * pad);
    return [x, y] as const;
  });
  const f = (x: number) => Math.round(x * 100) / 100;
  let line = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(n - 1, i + 2)];
    // Tension 1/6: the standard Catmull-Rom → cubic Bézier conversion. The
    // control points are clamped to the box so a spike can't overshoot it.
    const c1y = Math.min(height, Math.max(0, y1 + (y2 - y0) / 6));
    const c2y = Math.min(height, Math.max(0, y2 - (y3 - y1) / 6));
    line += ` C${f(x1 + (x2 - x0) / 6)},${f(c1y)} ${f(x2 - (x3 - x1) / 6)},${f(c2y)} ${f(x2)},${f(y2)}`;
  }
  const area = `${line} L${f(pts[n - 1][0])},${height} L${f(pts[0][0])},${height} Z`;
  return { line, area };
}
