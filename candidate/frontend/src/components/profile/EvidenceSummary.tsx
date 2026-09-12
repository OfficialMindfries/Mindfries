import { FileCheck2 } from "lucide-react";
import { activity, assessments, stats } from "@/lib/dashboard/data";

/**
 * What this candidate's evidence adds up to so far — the profile page's
 * answer to "why should this be here at all", given the product's whole
 * differentiator is evidence over a bare score (PRD's framing, and the same
 * one SideRail's "What gets recorded" card leads with on the dashboard).
 *
 * Every number here is derived from the same sample arrays the dashboard
 * already renders — assessments, activity, stats — rather than invented
 * separately, so this card can't drift out of sync with what the dashboard
 * says elsewhere on the site.
 */
export function EvidenceSummary() {
  const completed = assessments.filter((a) => a.status === "submitted" || a.status === "closed").length;
  const practiceRuns = stats.find((s) => s.kind === "practice")?.value ?? 0;
  const reportsShared = activity.filter((entry) => entry.kind === "report").length;

  const rows = [
    { label: "Assessments completed", value: completed },
    { label: "Practice runs", value: practiceRuns },
    { label: "Evidence reports shared", value: reportsShared },
  ];

  return (
    <section className="rounded-2xl border border-[#B3CFE5] bg-[#0A1931] p-5 text-[#F6FAFD]">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F6FAFD]/10">
        <FileCheck2 size={17} className="text-[#B3CFE5]" />
      </span>
      <h2 className="mt-3 text-sm font-semibold">Your evidence, so far</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#B3CFE5]">
        Companies don&apos;t see a score — they see how you worked. This is what that adds up to.
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[#F6FAFD]/15 pt-4">
        {rows.map((row) => (
          <div key={row.label}>
            <dd className="text-2xl leading-none font-semibold tabular-nums">{row.value}</dd>
            <dt className="mt-1.5 text-[11px] leading-snug text-[#B3CFE5]">{row.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
