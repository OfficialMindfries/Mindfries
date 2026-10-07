import { BarChart3 } from "lucide-react";
import type { Assessment } from "@/lib/dashboard/data";

/**
 * What this candidate's evidence adds up to so far — the profile page's
 * answer to "why should this be here at all", given the product's whole
 * differentiator is evidence over a bare score (PRD's framing, and the same
 * one SideRail's "What gets recorded" card leads with on the dashboard).
 *
 * Every number is counted from the candidate's own real assessments — the
 * same list the dashboard renders — so a brand-new account reads 0 across
 * the board instead of someone else's history.
 */
export function EvidenceSummary({ items = [] }: { items?: Assessment[] }) {
  const count = (...statuses: Assessment["status"][]) => items.filter((a) => statuses.includes(a.status)).length;

  const rows = [
    { label: "Assessments completed", value: count("submitted", "closed") },
    { label: "In progress", value: count("in-progress") },
    { label: "Open to start", value: count("invited") },
  ];

  return (
    <section className="rounded-2xl bg-[#F9CDE2] p-5 shadow-[0_10px_24px_-14px_rgba(10,25,49,0.35)]">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0A1931]/10 text-[#0A1931]">
        <BarChart3 size={17} />
      </span>
      <h2 className="mt-3 text-sm font-semibold text-[#0A1931]">Your evidence, so far</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#0A1931]/70">
        Companies don&apos;t see a score — they see how you worked. This is what that adds up to.
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[#0A1931]/10 pt-4">
        {rows.map((row) => (
          <div key={row.label}>
            <dd className="text-2xl leading-none font-semibold tabular-nums text-[#0A1931]">{row.value}</dd>
            <dt className="mt-1.5 text-[11px] leading-snug text-[#0A1931]/70">{row.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
