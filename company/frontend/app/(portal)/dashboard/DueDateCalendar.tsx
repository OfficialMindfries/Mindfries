import Link from "next/link";
import { fmtDate } from "@/lib/format";
import type { DueCandidate } from "@/lib/types";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

// Builds the key from the Date's own local fields — not `toISOString()`,
// which converts to UTC and can shift the calendar day depending on the
// server's local timezone offset. `dueDate` comes from a Postgres `date`
// column (no time, no timezone) as a plain "YYYY-MM-DD" string, so the key
// for a locally-constructed calendar cell must match that literally, not a
// UTC-shifted version of it.
function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Real due dates only (assessments.due_date, set at invite time) — no
 * events invented for days nothing is actually due. The "Open Calendar"
 * idea from the reference becomes the "Upcoming" list below the grid
 * instead of a separate route — everything that list would show is
 * already on this one screen.
 */
export function DueDateCalendar({ due, asOf }: { due: DueCandidate[]; asOf: Date }) {
  const byDay = new Map<string, DueCandidate[]>();
  for (const d of due) {
    const list = byDay.get(d.dueDate) ?? [];
    list.push(d);
    byDay.set(d.dueDate, list);
  }

  const year = asOf.getFullYear();
  const month = asOf.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();
  const todayKey = toKey(asOf);

  const cells: { day: number | null; key: string }[] = [
    ...Array.from({ length: leadingBlanks }, () => ({ day: null, key: "" })),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return { day, key: toKey(new Date(year, month, day)) };
    }),
  ];

  const upcoming = due.filter((d) => d.dueDate >= todayKey).slice(0, 5);

  return (
    <div className="p-5">
      <div className="mb-3 text-sm font-bold">{asOf.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="pb-1 text-[11px] font-semibold text-faint">
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          const candidates = c.key ? byDay.get(c.key) : undefined;
          const isToday = c.key === todayKey;
          return (
            <div
              key={i}
              className={`grid aspect-square place-items-center rounded-lg text-xs ${
                c.day == null
                  ? ""
                  : candidates?.length
                    ? "bg-accent font-bold text-white"
                    : isToday
                      ? "bg-accent-soft font-semibold text-accent"
                      : "text-dim"
              }`}
              title={candidates?.length ? `${candidates.length} due: ${candidates.map((cd) => cd.candidateName ?? cd.candidateEmail).join(", ")}` : undefined}
            >
              {c.day}
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-hair pt-4">
        <div className="mb-2 text-xs font-semibold tracking-[0.1em] text-faint uppercase">Upcoming</div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-faint">No upcoming due dates.</p>
        ) : (
          <ul className="space-y-2.5">
            {upcoming.map((d) => (
              <li key={d.applicationId}>
                <Link href={`/candidates/${d.applicationId}`} className="flex items-center justify-between gap-2 hover:underline">
                  <span className="truncate text-sm font-medium">{d.candidateName ?? d.candidateEmail}</span>
                  <span className="shrink-0 text-xs text-dim">{fmtDate(d.dueDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
