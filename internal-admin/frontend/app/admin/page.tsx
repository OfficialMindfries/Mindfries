import { Box, Radio, TriangleAlert, Users } from "lucide-react";
import { companies, templates, sessions, SAMPLE_AS_OF } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui";
import { MetricCard, MetricGrid, Panel, SoftPill, flat } from "@/components/admin/cards";
import { SampleBadge } from "@/components/admin/SampleBadge";
import { VARIANT, avatarFor, initials } from "@/components/admin/visuals";
import { ago, countWithin, cumulative, DAY, HOUR, perBucket, WEEK } from "@/lib/overview";
import { todayIn } from "@/lib/targets-rules";
import { TEAM_TZ } from "@/lib/team-time";

/**
 * Everything the Mindfries team runs, at a glance.
 *
 * Shows the sample fixtures in lib/mock-data, and says so in its header — the
 * trends and sparklines are real calculations, over sample records, measured
 * from the sample's own snapshot time (SAMPLE_AS_OF) rather than now.
 */

export default function OverviewPage() {
  const asOf = new Date(SAMPLE_AS_OF);
  const today = todayIn(TEAM_TZ, asOf);
  const onDay = (iso: string) => todayIn(TEAM_TZ, new Date(iso)) === today;

  const active = companies.filter((c) => c.status === "active");
  const published = templates.filter((t) => t.status === "published");
  const live = sessions.filter((s) => s.status === "live");
  const attention = sessions.filter((s) => s.status === "stuck" || s.status === "failed");
  const recent = [...templates].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  const newCompanies = countWithin(active.map((c) => c.createdAt), asOf, 30 * DAY);
  const startedToday = sessions.filter((s) => onDay(s.startedAt)).length;
  const newGames = countWithin(published.map((t) => t.createdAt), asOf, 30 * DAY);
  const newProblems = attention.filter((s) => onDay(s.startedAt)).length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Mindfries Ops" title="Overview" action={<SampleBadge asOf={asOf} />} />

      <MetricGrid columns={4}>
        <MetricCard
          id="companies" label="Active Companies" value={active.length} icon={Users} tone="violet" href="/admin/companies"
          trend={newCompanies ? { text: `+${newCompanies} this month`, direction: "up", good: true } : flat("No new this month")}
          series={cumulative(active.map((c) => c.createdAt), asOf, 12, WEEK)}
          seriesLabel="Active companies, running total over the last 12 weeks"
        />
        <MetricCard
          id="sessions" label="Live Sessions" value={live.length} icon={Radio} tone="blue" href="/admin/sessions"
          trend={startedToday ? { text: `${startedToday} started today`, direction: "up", good: true } : flat("None started today")}
          series={perBucket(sessions.map((s) => s.startedAt), asOf, 12, HOUR)}
          seriesLabel="Sessions started per hour, last 12 hours"
        />
        <MetricCard
          id="games" label="Published Games" value={published.length} icon={Box} tone="green" href="/admin/library"
          trend={newGames ? { text: `+${newGames} this month`, direction: "up", good: true } : flat("None new this month")}
          series={cumulative(published.map((t) => t.createdAt), asOf, 12, WEEK)}
          seriesLabel="Published games, running total over the last 12 weeks"
        />
        <MetricCard
          id="attention" label="Needs Attention" value={attention.length} icon={TriangleAlert} tone="red" href="/admin/sessions"
          // Up is bad news here, so it's coloured as a warning, not a win.
          trend={attention.length === 0 ? flat("All clear") : newProblems ? { text: `+${newProblems} today`, direction: "up", good: false } : flat("None new today")}
          series={cumulative(attention.map((s) => s.startedAt), asOf, 12, HOUR)}
          seriesLabel="Stuck or failed sessions, running total over the last 12 hours"
        />
      </MetricGrid>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          className="lg:col-span-3"
          title="Needs attention"
          count={attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"}` : undefined}
          countTone="red"
          subtitle="Sessions that need your review or action, and what's running now."
          action={{ label: "View all", href: "/admin/sessions" }}
        >
          {attention.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-dim">All sessions healthy.</div>
          ) : (
            <ul className="divide-y divide-hair">
              {attention.map((s) => (
                <li key={s.id} className="flex items-center gap-4 px-6 py-3.5">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${avatarFor(s.candidateName)}`}>
                    {initials(s.candidateName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{s.candidateName}</div>
                    <div className="truncate text-xs text-dim">{s.companyName} · {s.templateName}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="flex justify-end gap-1.5">
                      <SoftPill tone={s.sandboxHealth === "healthy" ? "gray" : "red"}>sandbox {s.sandboxHealth}</SoftPill>
                      <SoftPill tone="red">{s.status}</SoftPill>
                    </div>
                    <div className="mt-1 text-xs text-faint">{ago(s.startedAt, asOf)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* What's running right now — the other half of "is anything wrong?". */}
          <div className="border-t border-hair bg-surface-2/40 px-6 pt-3.5 pb-1 text-xs font-semibold tracking-[0.1em] text-faint uppercase">
            Live now · {live.length}
          </div>
          <ul className="divide-y divide-hair">
            {live.map((s) => (
              <li key={s.id} className="flex items-center gap-4 px-6 py-3">
                <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e7f0ff] text-sm font-bold text-[#2f5fc4]">
                  {initials(s.candidateName)}
                  <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-[#2fbf71]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{s.candidateName}</div>
                  <div className="truncate text-xs text-dim">{s.companyName} · {s.templateName}</div>
                </div>
                <div className="w-40 shrink-0">
                  <div className="flex items-center justify-between text-[11px] text-dim">
                    <span className="mono">{s.elapsedMin}/{s.durationMin}m</span>
                    {s.sandboxHealth !== "healthy" && <span className="font-semibold text-[#b7791f]">{s.sandboxHealth}</span>}
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className={`h-full rounded-full ${s.sandboxHealth === "healthy" ? "bg-[#4f8ff0]" : "bg-[#e3a63b]"}`} style={{ width: `${s.progressPct}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          className="lg:col-span-2"
          title="Recent games"
          subtitle="Latest games and their status."
          action={{ label: "View library", href: "/admin/library" }}
        >
          <ul className="divide-y divide-hair">
            {recent.map((t) => {
              const v = VARIANT[t.taskVariant];
              const Icon = v.icon;
              return (
                <li key={t.id} className="flex items-center gap-3.5 px-6 py-3.5">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${v.tile}`}>
                    <Icon size={18} strokeWidth={2.1} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold" title={t.name}>{t.name}</div>
                    <div className="truncate text-xs text-dim">used by {t.usedByCompanies} compan{t.usedByCompanies === 1 ? "y" : "ies"}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <SoftPill tone={t.status === "published" ? "green" : "gray"}>{t.status}</SoftPill>
                    <div className="mt-1 text-xs text-faint">{ago(t.createdAt, asOf)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
