"use client";

import { useState } from "react";
import Link from "next/link";
import { Pill } from "@/components/ui";
import { fmtDate, stageLabel, stageTone, titleCase } from "@/lib/format";
import type { CandidateApplicationWithRole } from "@/lib/db";

type SortKey = { kind: "score" } | { kind: "time" } | { kind: "section"; name: string };

function valueFor(a: CandidateApplicationWithRole, key: SortKey): number | null {
  if (key.kind === "score") return a.score;
  if (key.kind === "time") return a.timeTakenMin;
  return a.sectionScores[key.name] ?? null;
}

function sameKey(a: SortKey, b: SortKey): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "section" && b.kind === "section" ? a.name === b.name : true;
}

const ROW_LABEL = "px-4 py-3 text-left text-xs font-semibold tracking-wide text-faint uppercase";

/** Columns are candidates, rows are metrics — clicking a row label sorts the columns by that metric, descending (nulls last). */
export function CompareTable({ candidates }: { candidates: CandidateApplicationWithRole[] }) {
  const [order, setOrder] = useState<string[]>(candidates.map((c) => c.id));
  const [sortKey, setSortKey] = useState<SortKey | null>(null);

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const displayed = order.map((id) => byId.get(id)).filter((c): c is CandidateApplicationWithRole => !!c);
  const sectionNames = Array.from(new Set(candidates.flatMap((c) => Object.keys(c.sectionScores)))).sort();

  function sortBy(key: SortKey) {
    setSortKey(key);
    setOrder((prev) =>
      [...prev].sort((a, b) => {
        const va = valueFor(byId.get(a)!, key);
        const vb = valueFor(byId.get(b)!, key);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return vb - va;
      }),
    );
  }

  function rowLabel(sortableKey: SortKey, label: string) {
    const active = sortKey != null && sameKey(sortKey, sortableKey);
    return (
      <button
        type="button"
        onClick={() => sortBy(sortableKey)}
        className={`${ROW_LABEL} w-full ${active ? "text-accent" : "hover:text-ink"}`}
      >
        {label} {active ? "↓" : ""}
      </button>
    );
  }

  return (
    <div className="hair-card overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-hair">
            <th className={ROW_LABEL}>Candidate</th>
            {displayed.map((c) => (
              <th key={c.id} className="px-4 py-3 text-left">
                <Link href={`/candidates/${c.id}`} className="font-bold hover:underline">
                  {c.candidateName ?? c.candidateEmail}
                </Link>
                <div className="truncate text-xs font-normal text-dim">{c.roleTitle}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hair">
          <tr>
            <td className={ROW_LABEL}>Stage</td>
            {displayed.map((c) => (
              <td key={c.id} className="px-4 py-3">
                <Pill tone={stageTone[c.stage]}>{stageLabel[c.stage]}</Pill>
              </td>
            ))}
          </tr>
          <tr>
            <td className="p-0">{rowLabel({ kind: "score" }, "Overall score")}</td>
            {displayed.map((c) => (
              <td key={c.id} className="mono px-4 py-3">
                {c.score != null ? `${c.score}%` : "—"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="p-0">{rowLabel({ kind: "time" }, "Time taken")}</td>
            {displayed.map((c) => (
              <td key={c.id} className="mono px-4 py-3">
                {c.timeTakenMin != null ? `${c.timeTakenMin}m` : "—"}
              </td>
            ))}
          </tr>
          {sectionNames.map((name) => (
            <tr key={name}>
              <td className="p-0">{rowLabel({ kind: "section", name }, titleCase(name))}</td>
              {displayed.map((c) => (
                <td key={c.id} className="mono px-4 py-3">
                  {c.sectionScores[name] != null ? `${c.sectionScores[name]}%` : "—"}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className={ROW_LABEL}>Invited</td>
            {displayed.map((c) => (
              <td key={c.id} className="px-4 py-3 text-xs text-faint">
                {fmtDate(c.createdAt)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
