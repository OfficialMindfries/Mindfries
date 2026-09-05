"use client";

import { useState, useTransition } from "react";
import type { Session } from "@/lib/types";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { healthTone, sessionTone } from "@/lib/format";
import { resetSession, retriggerEval } from "@/app/admin/actions";

type Filter = "all" | "live" | "attention";
const needsAttention = (s: Session) => s.status === "stuck" || s.status === "failed";

export function SessionsView({ initial }: { initial: Session[] }) {
  const [rows, setRows] = useState<Session[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, start] = useTransition();

  function doReset(id: string) {
    setRows((r) => r.map((s) => (s.id === id ? { ...s, status: "live", sandboxHealth: "healthy", elapsedMin: 0, progressPct: 0 } : s)));
    start(async () => { await resetSession(id); });
  }
  function doRetrigger(id: string) {
    setRows((r) => r.map((s) => (s.id === id ? { ...s, status: "evaluating" } : s)));
    start(async () => { await retriggerEval(id); });
  }

  const shown = rows.filter((s) => (filter === "live" ? s.status === "live" : filter === "attention" ? needsAttention(s) : true));
  const live = rows.filter((s) => s.status === "live").length;
  const attention = rows.filter(needsAttention).length;

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: rows.length },
    { key: "live", label: "Live", count: live },
    { key: "attention", label: "Needs attention", count: attention },
  ];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Global Session Monitor" title="Sessions">
        Every candidate assessment across all companies, live and past — written by the candidate app as sessions run.
        Reset a stuck sandbox or re-trigger evaluation as a support action.
      </PageHeader>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total sessions" value={rows.length} />
        <StatCard label="Live now" value={live} />
        <StatCard label="Needs attention" value={attention} />
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              filter === t.key ? "bg-accent text-white" : "border border-hair bg-surface text-dim hover:text-ink"
            }`}
          >
            {t.label} <span className="mono opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="hair-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-5 py-3 font-semibold">Candidate</th>
                <th className="px-5 py-3 font-semibold">Company</th>
                <th className="px-5 py-3 font-semibold">Game</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Sandbox</th>
                <th className="px-5 py-3 font-semibold">Progress</th>
                <th className="px-5 py-3 text-right font-semibold">Support</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {shown.map((s) => (
                <tr key={s.id} className="hover:bg-black/[0.015]">
                  <td className="px-5 py-4 font-semibold">{s.candidateName}</td>
                  <td className="px-5 py-4 text-dim">{s.companyName}</td>
                  <td className="px-5 py-4 text-dim">{s.templateName}</td>
                  <td className="px-5 py-4">
                    <Pill tone={sessionTone[s.status]} dot={s.status === "live"}>{s.status}</Pill>
                  </td>
                  <td className="px-5 py-4">
                    <Pill tone={healthTone[s.sandboxHealth]}>{s.sandboxHealth}</Pill>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${s.progressPct}%` }} />
                      </div>
                      <span className="mono text-xs text-dim">{s.elapsedMin}/{s.durationMin}m</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1.5">
                      {needsAttention(s) && (
                        <button onClick={() => doReset(s.id)} disabled={pending} className="rounded-lg border border-hair px-2.5 py-1.5 text-xs font-semibold text-dim hover:border-hair-bright hover:text-ink disabled:opacity-40">
                          Reset
                        </button>
                      )}
                      {(needsAttention(s) || s.status === "submitted" || s.status === "completed") && (
                        <button onClick={() => doRetrigger(s.id)} disabled={pending} className="rounded-lg border border-hair px-2.5 py-1.5 text-xs font-semibold text-dim hover:border-hair-bright hover:text-ink disabled:opacity-40">
                          Re-trigger eval
                        </button>
                      )}
                      {s.status === "live" && <span className="text-xs text-faint">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-dim">No sessions in this view.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
