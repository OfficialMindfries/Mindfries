// Run: npx --yes tsx lib/icp.test.mts
import assert from "node:assert/strict";
import { scoreLead, dedupeByCompany, type RawLead } from "./icp.ts";

const base: RawLead = { company: "X", domain: null, roleTitle: null, location: null, tags: [], source: "t", sourceUrl: null };

// A senior backend role with a reachable domain outranks a bare non-eng post.
const strong = scoreLead({ ...base, roleTitle: "Senior Backend Engineer", tags: ["python", "api"], location: "Remote", domain: "acme.io" });
const weak = scoreLead({ ...base, roleTitle: "Barista", tags: [] });
assert.ok(strong > weak, "eng+senior should outscore non-eng");
assert.ok(strong <= 100 && weak >= 0, "score stays in 0..100");
assert.equal(weak, 0, "no eng signal, no tags, no location/domain -> 0");
assert.ok(scoreLead({ ...base, roleTitle: "Software Developer" }) >= 45, "any eng role clears the bar");

// Dedup keeps one row per company (case-insensitive), the highest score wins.
const deduped = dedupeByCompany([
  { ...base, company: "Acme", score: 50 },
  { ...base, company: "acme", score: 80 },
  { ...base, company: "Beta", score: 60 },
]);
assert.equal(deduped.length, 2, "Acme/acme collapse to one");
assert.equal(deduped.find((d) => d.company.toLowerCase() === "acme")!.score, 80, "keeps best score");

console.log("icp.test.mts: all assertions passed");
