import Link from "next/link";
import clsx from "clsx";
import { ASSESSMENT_STATUSES, statusLabels, type AssessmentStatus } from "@/lib/dashboard/data";

/**
 * The status filter on /assessments. Plain links with a query string, not
 * client state — the filtered result is a real URL you can bookmark or share,
 * and the page itself does the filtering server-side.
 */
export function StatusTabs({
  active,
  counts,
  total,
}: {
  active?: AssessmentStatus;
  counts: Record<AssessmentStatus, number>;
  total: number;
}) {
  return (
    <nav className="mt-6 flex flex-wrap items-center gap-1.5" aria-label="Filter by status">
      <Tab href="/assessments" label="All" count={total} active={!active} />
      {ASSESSMENT_STATUSES.map((status) => (
        <Tab
          key={status}
          href={`/assessments?status=${status}`}
          label={statusLabels[status]}
          count={counts[status]}
          active={active === status}
        />
      ))}
    </nav>
  );
}

function Tab({ href, label, count, active }: { href: string; label: string; count: number; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
        active ? "bg-[#1A3D63] text-[#F6FAFD]" : "text-[#4A7FA7] hover:bg-[#B3CFE5]/30 hover:text-[#1A3D63]"
      )}
    >
      {label}
      <span className={clsx("tabular-nums", active ? "text-[#B3CFE5]" : "text-[#4A7FA7]/70")}>{count}</span>
    </Link>
  );
}
