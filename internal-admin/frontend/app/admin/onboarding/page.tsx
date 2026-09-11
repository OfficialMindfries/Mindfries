import { listOnboarded } from "@/lib/db";
import { CircleCheck, KeyRound, Rocket } from "lucide-react";
import { PageHeader, Pill } from "@/components/ui";
import { MetricCard, MetricGrid, Panel, flat } from "@/components/admin/cards";
import { countWithin, cumulative, DAY, WEEK } from "@/lib/overview";
import { OnboardForm } from "@/components/admin/OnboardForm";
import { companyTone, fmtDate, planLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

type Prefill = { company?: string; adminEmail?: string; targetId?: string };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Prefill> }) {
  const prefill = await searchParams;
  const rows = await listOnboarded();
  const now = new Date();
  const active = rows.filter((r) => r.status === "active");
  const sent = rows.filter((r) => r.credentialsSentAt);
  const newThisMonth = countWithin(rows.map((r) => r.createdAt), now, 30 * DAY);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Conversion" title="Onboarding" />

      <MetricGrid columns={3}>
        <MetricCard
          id="onboarded" label="Onboarded" value={rows.length} icon={Rocket} tone="violet"
          trend={newThisMonth ? { text: `+${newThisMonth} this month`, direction: "up", good: true } : flat("None this month")}
          series={cumulative(rows.map((r) => r.createdAt), now, 12, WEEK)} seriesLabel="Companies onboarded, running total over the last 12 weeks"
        />
        <MetricCard
          id="active" label="Active" value={active.length} icon={CircleCheck} tone="green"
          trend={flat(`${rows.length - active.length} paused`)}
          series={cumulative(active.map((r) => r.createdAt), now, 12, WEEK)} seriesLabel="Active companies, running total over the last 12 weeks"
        />
        <MetricCard
          id="sent" label="Credentials sent" value={sent.length} icon={KeyRound} tone="blue"
          trend={flat(rows.length === sent.length ? "Every admin has theirs" : `${rows.length - sent.length} not sent`)}
          series={cumulative(sent.map((r) => r.credentialsSentAt as string), now, 12, WEEK)} seriesLabel="Credentials emailed, running total over the last 12 weeks"
        />
      </MetricGrid>

      {/* Keyed so arriving from a different target re-seeds the form. */}
      <OnboardForm key={prefill.targetId ?? "blank"} initial={prefill} />

      <Panel title="Onboarded companies" count={`${rows.length} total`} subtitle="Every company given a workspace, and whether its admin has their sign-in.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair bg-[#fafafc] text-left text-[13px] font-semibold text-ink">
                <th className="px-5 py-3 font-semibold">Company</th>
                <th className="px-5 py-3 font-semibold">Admin</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Credentials</th>
                <th className="px-5 py-3 font-semibold">Onboarded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-black/[0.015]">
                  <td className="px-5 py-4 font-semibold">{r.company}</td>
                  <td className="px-5 py-4">
                    <a href={`mailto:${r.adminEmail}`} className="text-accent hover:underline">{r.adminEmail}</a>
                  </td>
                  <td className="px-5 py-4 text-dim">{planLabel[r.plan]}</td>
                  <td className="px-5 py-4"><Pill tone={companyTone[r.status]}>{r.status}</Pill></td>
                  <td className="px-5 py-4 text-dim">{r.credentialsSentAt ? "Sent" : "—"}</td>
                  <td className="px-5 py-4 text-dim">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-dim">No companies onboarded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
