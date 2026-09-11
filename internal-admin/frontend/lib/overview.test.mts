// Run: npx --yes tsx lib/overview.test.mts
import assert from "node:assert/strict";
import { ago, countWithin, cumulative, cumulativeSum, DAY, HOUR, perBucket, sparkPaths, WEEK } from "./overview.ts";

const asOf = new Date("2026-08-29T09:30:00Z");

// cumulative: a running total that only ever rises, ending at the full count.
const created = ["2026-05-28", "2026-06-11", "2026-08-19"];
const c = cumulative(created, asOf, 12, WEEK);
assert.equal(c.length, 12);
assert.equal(c[c.length - 1], 3, "ends at everything that has happened by asOf");
assert.ok(c.every((v, i) => i === 0 || v >= c[i - 1]), "never falls");
assert.equal(cumulative(["2026-09-01"], asOf, 4, WEEK).at(-1), 0, "a date after asOf isn't counted");

// cumulativeSum: adds values, not items.
const money = cumulativeSum([{ date: "2026-06-01", value: 99 }, { date: "2026-08-20", value: 399 }, { date: "2026-09-10", value: 1500 }], asOf, 4, WEEK);
assert.equal(money.at(-1), 498, "99 + 399; the September company isn't onboarded yet as of Aug 29");
assert.equal(money[0], 99, "four weeks earlier only the June company counted");

// perBucket: counts land in the right hour, and the window's edges are exact.
const starts = ["2026-08-29T09:25:00Z", "2026-08-29T09:02:00Z", "2026-08-29T08:35:00Z", "2026-08-29T08:10:00Z", "2026-08-28T14:12:00Z"];
const p = perBucket(starts, asOf, 12, HOUR);
assert.equal(p.reduce((a, b) => a + b, 0), 4, "the one from yesterday is outside a 12-hour window");
assert.equal(p[11], 3, "08:35, 09:02 and 09:25 are all in the last hour, (08:30, 09:30]");
assert.equal(p[10], 1, "08:10 is in the hour before, (07:30, 08:30]");
assert.equal(perBucket(["2026-08-29T08:30:00Z"], asOf, 12, HOUR)[10], 1, "a start exactly on a boundary belongs to the earlier bucket");

// countWithin: a trailing window.
assert.equal(countWithin(created, asOf, 30 * DAY), 1, "only Aug 19 is within 30 days");
assert.equal(countWithin(starts, asOf, DAY), 5, "all five within 24 hours");

// ago
assert.equal(ago("2026-08-29T09:29:30Z", asOf), "just now");
assert.equal(ago("2026-08-29T09:05:00Z", asOf), "25 min ago");
assert.equal(ago("2026-08-29T07:20:00Z", asOf), "2 hours ago");
assert.equal(ago("2026-08-28T08:00:00Z", asOf), "yesterday");
assert.equal(ago("2026-08-14", asOf), "2 weeks ago");
assert.equal(ago("2026-06-02", asOf), "2 months ago");

// sparkPaths: well-formed, inside the box, and a flat line isn't a divide-by-zero.
const s = sparkPaths([1, 3, 2, 5], 120, 44);
assert.match(s.line, /^M[\d.]+,[\d.]+( C[\d.,\s]+)+$/, "a move then curves");
assert.ok(s.area.endsWith("Z"), "the area closes");
const ys = [...s.line.matchAll(/,([\d.]+)/g)].map((m) => Number(m[1]));
assert.ok(ys.every((y) => y >= 0 && y <= 44), "every point and control point stays in the box");
assert.doesNotMatch(sparkPaths([2, 2, 2], 120, 44).line, /NaN|Infinity/, "flat series draw a flat line");
assert.equal(sparkPaths([], 120, 44).line, "");

console.log("overview: all checks passed");
