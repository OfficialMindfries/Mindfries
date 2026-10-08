import { Panel } from "@/components/admin/cards";
import { AI_SPEND_ROW_CAP, fmtUsdFine, type AiSpend, type AiSpendRow } from "@/lib/ai-spend";

/**
 * What the AI has actually cost so far — the charges OpenRouter reported for
 * each model call, added up by which agent made them and which company's
 * candidates they were for.
 *
 * Shown as two plain tables rather than a chart: the question this answers
 * is "what does a candidate cost us, and where does it go", and at today's
 * volumes the exact figures are more use than a trend line.
 */
export function AiSpendPanel({ spend }: { spend: AiSpend & { capped: boolean } }) {
  if (!spend.available) {
    return (
      <Panel title="AI spend" subtitle="What each model call cost, as billed.">
        <p className="px-5 py-10 text-center text-sm text-dim">AI spend isn&apos;t available — the database couldn&apos;t be read.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="AI spend"
      count={`${spend.calls} call${spend.calls === 1 ? "" : "s"}`}
      subtitle={
        spend.calls === 0
          ? "No model calls have been recorded yet. Each one is stored with its real cost as candidates use the assistant, the interviewer and the report."
          : `${fmtUsdFine(spend.totalUsd)} across ${spend.sessions} session${spend.sessions === 1 ? "" : "s"} — ${fmtUsdFine(spend.perSessionUsd)} per session on average. Real charges, as billed by OpenRouter.`
      }
    >
      {spend.calls > 0 && (
        <div className="grid gap-px bg-hair lg:grid-cols-2">
          <SpendTable heading="By agent" rows={spend.byAgent} total={spend.totalUsd} />
          <SpendTable heading="By company" rows={spend.byCompany} total={spend.totalUsd} />
        </div>
      )}
      {spend.capped && (
        <p className="border-t border-hair px-5 py-3 text-xs text-dim">
          Showing the most recent {AI_SPEND_ROW_CAP.toLocaleString("en-US")} calls only — totals above are lower than the true all-time figure.
        </p>
      )}
    </Panel>
  );
}

function SpendTable({ heading, rows, total }: { heading: string; rows: AiSpendRow[]; total: number }) {
  return (
    <div className="overflow-x-auto bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hair bg-[#fafafc] text-left text-[13px] font-semibold text-ink">
            <th className="px-5 py-3 font-semibold">{heading}</th>
            <th className="px-5 py-3 text-right font-semibold">Calls</th>
            <th className="px-5 py-3 text-right font-semibold">Tokens</th>
            <th className="px-5 py-3 text-right font-semibold">Cost</th>
            <th className="px-5 py-3 text-right font-semibold">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hair">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-5 py-3 font-semibold">{r.label}</td>
              <td className="px-5 py-3 text-right mono text-dim">{r.calls}</td>
              <td className="px-5 py-3 text-right mono text-dim">{r.tokens.toLocaleString("en-US")}</td>
              <td className="px-5 py-3 text-right mono">{fmtUsdFine(r.costUsd)}</td>
              <td className="px-5 py-3 text-right mono text-dim">{total > 0 ? `${Math.round((r.costUsd / total) * 100)}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
