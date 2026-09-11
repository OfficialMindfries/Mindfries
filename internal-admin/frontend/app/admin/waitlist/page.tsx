import { listWaitlist } from "@/lib/db";
import { Building2, CalendarDays, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { MetricCard, MetricGrid, Panel, flat } from "@/components/admin/cards";
import { countWithin, cumulative, DAY, perBucket, WEEK } from "@/lib/overview";
import { todayIn } from "@/lib/targets-rules";
import { TEAM_TZ } from "@/lib/team-time";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  const entries = await listWaitlist();
  const withCompany = entries.filter((e) => e.company).length;

  // "This month" is the calendar month in the team's timezone, compared with
  // the one before it.
  const now = new Date();
  const monthOf = (iso: string) => todayIn(TEAM_TZ, new Date(iso)).slice(0, 7);
  const thisMonth = todayIn(TEAM_TZ, now).slice(0, 7);
  const prev = new Date(`${thisMonth}-01T12:00:00Z`);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const lastMonth = prev.toISOString().slice(0, 7);
  const signupsThisMonth = entries.filter((e) => monthOf(e.createdAt) === thisMonth).length;
  const signupsLastMonth = entries.filter((e) => monthOf(e.createdAt) === lastMonth).length;
  const newThisWeek = countWithin(entries.map((e) => e.createdAt), now, WEEK);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Inbound" title="Waitlist" />

      <MetricGrid columns={3}>
        <MetricCard
          id="signups" label="Total signups" value={entries.length} icon={UserPlus} tone="violet"
          trend={newThisWeek ? { text: `+${newThisWeek} this week`, direction: "up", good: true } : flat("None this week")}
          series={cumulative(entries.map((e) => e.createdAt), now, 12, WEEK)} seriesLabel="Signups, running total over the last 12 weeks"
        />
        <MetricCard
          id="company" label="With a company" value={withCompany} icon={Building2} tone="blue"
          trend={flat(entries.length ? `${Math.round((withCompany / entries.length) * 100)}% of signups` : "No signups yet")}
          series={cumulative(entries.filter((e) => e.company).map((e) => e.createdAt), now, 12, WEEK)} seriesLabel="Signups with a company, running total over the last 12 weeks"
        />
        <MetricCard
          id="month" label="This month" value={signupsThisMonth} icon={CalendarDays} tone="green"
          trend={
            signupsThisMonth === signupsLastMonth
              ? flat("Same as last month")
              : { text: `${signupsLastMonth} last month`, direction: signupsThisMonth > signupsLastMonth ? "up" : "down", good: signupsThisMonth > signupsLastMonth }
          }
          series={perBucket(entries.map((e) => e.createdAt), now, 30, DAY)} seriesLabel="Signups per day, last 30 days"
        />
      </MetricGrid>

      <Panel title="Signups" count={`${entries.length} total`} subtitle="People who joined from the public waitlist page.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair bg-[#fafafc] text-left text-[13px] font-semibold text-ink">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold">Company</th>
                <th className="px-5 py-3 font-semibold">Message</th>
                <th className="px-5 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-black/[0.015]">
                  <td className="px-5 py-4 font-semibold">{e.name ?? "—"}</td>
                  <td className="px-5 py-4">
                    <a href={`mailto:${e.email}`} className="text-accent hover:underline">{e.email}</a>
                  </td>
                  <td className="px-5 py-4 text-dim">{e.company ?? "—"}</td>
                  <td className="px-5 py-4 max-w-sm truncate text-dim">{e.message ?? "—"}</td>
                  <td className="px-5 py-4 text-dim">{fmtDate(e.createdAt)}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-dim">
                    No signups yet. Share the <span className="mono">/waitlist</span> page.
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
