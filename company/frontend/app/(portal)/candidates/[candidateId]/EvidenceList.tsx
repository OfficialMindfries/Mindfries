import type { ReactNode } from "react";
import { clock, REF, type Moment } from "@/lib/moments";
import type { EvidenceItem, ReportAnnotation } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { AnnotationForm } from "./AnnotationForm";

/**
 * The report's evidence, as the hiring team reads it.
 *
 * Three things are done to what the AI wrote, none of which change it:
 *
 * - Citations ("[E1234]") become the moment they refer to — how far into
 *   the session, and what happened — so a claim can be checked against the
 *   session rather than taken on trust.
 * - Facts about the session that change how the rest should be read — no
 *   interview took place, part of the analysis is missing — are lifted to
 *   the top and shown as notices rather than as one more paragraph.
 * - A reviewer's notes and corrections sit under the section they're about,
 *   attributed and dated. The AI's text stays as it was written; a
 *   correction is shown beside it, never over it.
 */

const NOTICE = new Set(["interview_status", "incomplete"]);

const LABEL: Record<string, string> = {
  code_evaluation: "Code evaluation",
  reasoning: "Reasoning",
  workflow: "Workflow",
  interview: "Interview",
  ai_usage: "AI assistant usage",
  provenance: "Where the work came from",
  integrity: "Integrity",
  rubric: "Rubric scores",
  interview_status: "Interview",
  incomplete: "Missing from this report",
};

export const evidenceLabel = (category: string) => LABEL[category] ?? category.replace(/_/g, " ");

/** The observation with each citation replaced by its moment. */
function withMoments(text: string, moments: Map<number, Moment>): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(REF)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const moment = moments.get(Number(match[1]));
    if (moment) {
      out.push(
        <span
          key={`${at}-${moment.id}`}
          title={moment.what}
          className="mono mx-0.5 inline-block rounded-md bg-[color:var(--color-hair)] px-1.5 py-px align-baseline text-[11px] text-dim"
        >
          {clock(moment.offsetSeconds)}
        </span>,
      );
    }
    last = at + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Notes({ notes }: { notes: ReportAnnotation[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2">
      {notes.map((n) => (
        <li key={n.id} className="rounded-xl border border-hair px-3 py-2">
          <div className="text-[11px] font-semibold tracking-wide text-faint uppercase">
            {n.kind === "correction" ? "Reviewer's correction" : "Reviewer's note"} · {n.authorName} · {fmtDate(n.createdAt)}
          </div>
          <p className="mt-1 text-sm whitespace-pre-line">{n.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function EvidenceList({
  applicationId,
  evidence,
  moments,
  annotations,
  canAnnotate,
}: {
  applicationId: string;
  evidence: EvidenceItem[];
  moments: Moment[];
  annotations: ReportAnnotation[];
  canAnnotate: boolean;
}) {
  const byId = new Map(moments.map((m) => [m.id, m]));
  const notices = evidence.filter((e) => NOTICE.has(e.category));
  const rest = evidence.filter((e) => !NOTICE.has(e.category));
  const cited = moments.filter((m) => evidence.some((e) => e.observation.includes(`[E${m.id}]`))).sort((a, b) => a.offsetSeconds - b.offsetSeconds);

  return (
    <div className="space-y-4">
      {notices.map((e) => (
        <div key={e.id} role="note" className="rounded-xl border border-[#e7b8c2] bg-[#fdecef] px-5 py-3.5">
          <div className="text-xs font-semibold tracking-wide text-[#a6203c] uppercase">{evidenceLabel(e.category)}</div>
          <p className="mt-1 text-sm text-[#7a1a2e]">{e.observation}</p>
        </div>
      ))}

      {rest.length > 0 && (
        <div className="hair-card divide-y divide-hair">
          {rest.map((e) => (
            <div key={e.id} className="px-6 py-3.5">
              <div className="text-xs font-semibold tracking-wide text-faint uppercase">{evidenceLabel(e.category)}</div>
              <p className="mt-1 text-sm whitespace-pre-line">{withMoments(e.observation, byId)}</p>
              <Notes notes={annotations.filter((n) => n.category === e.category)} />
              {canAnnotate && <AnnotationForm applicationId={applicationId} category={e.category} />}
            </div>
          ))}
        </div>
      )}

      {cited.length > 0 && (
        <details className="hair-card px-6 py-3.5">
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-faint uppercase">
            Moments cited above ({cited.length})
          </summary>
          <p className="mt-2 text-[13px] text-dim">
            Times are minutes and seconds into the session. Each is something the session actually recorded, which the
            observation citing it rests on.
          </p>
          <ul className="mt-2 space-y-1.5">
            {cited.map((m) => (
              <li key={m.id} className="flex gap-3 text-sm">
                <span className="mono w-12 shrink-0 text-dim">{clock(m.offsetSeconds)}</span>
                <span>{m.what}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {(canAnnotate || annotations.some((n) => n.category === null)) && (
        <div className="hair-card px-6 py-3.5">
          <div className="text-xs font-semibold tracking-wide text-faint uppercase">Reviewer&apos;s notes on the report</div>
          <Notes notes={annotations.filter((n) => n.category === null)} />
          {canAnnotate && <AnnotationForm applicationId={applicationId} category={null} />}
        </div>
      )}
    </div>
  );
}
