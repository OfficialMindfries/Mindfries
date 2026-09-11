import { listLeads } from "@/lib/db";
import { PageHeader, Pill, StatCard, Chip } from "@/components/ui";
import { LeadActions } from "@/components/admin/LeadActions";
import { fmtDate, leadStageLabel, leadStageTone } from "@/lib/format";
import { targetsStore } from "@/lib/targets-store";
import { companyKey } from "@/lib/targets-rules";

export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const [leads, targets] = await Promise.all([listLeads(), targetsStore().listTargets()]);
  // A lead is "already a target" if a target links to it, or is the same
  // company by name — so the button opens it instead of offering a duplicate.
  const targetFor = (leadId: string, company: string) =>
    targets.find((t) => t.leadId === leadId)?.id ?? targets.find((t) => companyKey(t.name) === companyKey(company))?.id;

  const emailed = leads.filter((l) => l.stage !== "new").length;
  const replied = leads.filter((l) => l.repliedCount! > 0 || ["replied", "demo", "poc", "onboarded"].includes(l.stage)).length;
  const onboarded = leads.filter((l) => l.stage === "onboarded").length;
  const replyRate = emailed ? Math.round((replied / emailed) * 100) : 0;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Outbound Growth" title="Company Tracker" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Found" value={leads.length} />
        <StatCard label="Emailed" value={emailed} />
        <StatCard label="Replied" value={replied} />
        <StatCard label="Reply rate" value={`${replyRate}%`} />
        <StatCard label="Onboarded" value={onboarded} />
      </div>

      <div className="hair-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-5 py-3 font-semibold">Score</th>
                <th className="px-5 py-3 font-semibold">Company</th>
                <th className="px-5 py-3 font-semibold">Hiring for</th>
                <th className="px-5 py-3 font-semibold">Stack</th>
                <th className="px-5 py-3 font-semibold">Stage</th>
                <th className="px-5 py-3 font-semibold">Found</th>
                <th className="px-5 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-black/[0.015]">
                  <td className="px-5 py-4">
                    <span className="mono inline-grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-sm font-bold text-accent">
                      {l.score}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-semibold">{l.company}</div>
                    {l.sourceUrl ? (
                      <a href={l.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-dim hover:text-accent">
                        {l.location ?? l.source} ↗
                      </a>
                    ) : (
                      <div className="text-xs text-dim">{l.location ?? l.source}</div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-dim">{l.roleTitle ?? "—"}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {l.tags.slice(0, 3).map((t) => (
                        <Chip key={t}>{t}</Chip>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Pill tone={leadStageTone[l.stage]}>{leadStageLabel[l.stage]}</Pill>
                  </td>
                  <td className="px-5 py-4 text-dim">{fmtDate(l.createdAt)}</td>
                  <td className="px-5 py-4">
                    <LeadActions lead={l} targetId={targetFor(l.id, l.company)} />
                  </td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-dim">
                    No leads yet. Once the backend is connected, the daily crawler fills this — or hit{" "}
                    <span className="mono">/api/cron/discover</span> to run it now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
