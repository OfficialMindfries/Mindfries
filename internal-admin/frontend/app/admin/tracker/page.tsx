import { listLeads } from "@/lib/db";
import { Percent, Radar, Reply, Rocket, Send } from "lucide-react";
import { PageHeader, Pill, Chip } from "@/components/ui";
import { MetricCard, MetricGrid, Panel, flat } from "@/components/admin/cards";
import { countWithin, DAY, perBucket, WEEK } from "@/lib/overview";
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

  // Real data, measured from now. The crawler runs daily, so activity is
  // shown per day over the last two weeks.
  const now = new Date();
  const foundThisWeek = countWithin(leads.map((l) => l.createdAt), now, WEEK);
  const emailDates = leads.map((l) => l.lastEmailedAt).filter((d): d is string => !!d);
  const emailedThisWeek = countWithin(emailDates, now, WEEK);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Outbound Growth" title="Company Tracker" />

      <MetricGrid columns={5}>
        <MetricCard
          id="found" label="Found" value={leads.length} icon={Radar} tone="violet"
          trend={foundThisWeek ? { text: `+${foundThisWeek} this week`, direction: "up", good: true } : flat("None this week")}
          series={perBucket(leads.map((l) => l.createdAt), now, 14, DAY)} seriesLabel="Companies found per day, last 14 days"
        />
        <MetricCard
          id="emailed" label="Emailed" value={emailed} icon={Send} tone="blue"
          trend={emailedThisWeek ? { text: `${emailedThisWeek} this week`, direction: "up", good: true } : flat("None this week")}
          series={perBucket(emailDates, now, 14, DAY)} seriesLabel="Companies emailed per day, last 14 days"
        />
        <MetricCard id="replied" label="Replied" value={replied} icon={Reply} tone="green" trend={flat(`of ${emailed} emailed`)} />
        <MetricCard id="rate" label="Reply rate" value={`${replyRate}%`} icon={Percent} tone="teal" trend={flat(emailed ? "of companies emailed" : "Nothing sent yet")} />
        <MetricCard id="onboarded" label="Onboarded" value={onboarded} icon={Rocket} tone="amber" trend={flat("won from the tracker")} />
      </MetricGrid>

      <Panel title="Companies found" count={`${leads.length} total`} subtitle="Hiring engineers right now, ranked by how well they fit.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair bg-[#fafafc] text-left text-[13px] font-semibold text-ink">
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
      </Panel>
    </div>
  );
}
