import { listOnboarded } from "@/lib/db";
import { CircleDollarSign, PiggyBank, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { MetricCard, MetricGrid, Panel, flat } from "@/components/admin/cards";
import { cumulativeSum, DAY, WEEK } from "@/lib/overview";
import { fmtMoney, planLabel, planPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const rows = await listOnboarded();

  const withMoney = rows.map((r) => {
    const revenue = planPrice[r.plan];
    const margin = revenue - r.monthlyCost;
    return { ...r, revenue, margin };
  });
  const mrr = withMoney.reduce((s, r) => s + r.revenue, 0);
  const cost = withMoney.reduce((s, r) => s + r.monthlyCost, 0);
  const net = mrr - cost;

  // Revenue and cost as they built up, company by company, from the day each
  // was onboarded — running sums, measured from now.
  const now = new Date();
  const revenueSeries = cumulativeSum(withMoney.map((r) => ({ date: r.createdAt, value: r.revenue })), now, 12, WEEK);
  const costSeries = cumulativeSum(withMoney.map((r) => ({ date: r.createdAt, value: r.monthlyCost })), now, 12, WEEK);
  const netSeries = revenueSeries.map((v, i) => v - costSeries[i]);
  const addedThisMonth = withMoney
    .filter((r) => Date.parse(r.createdAt) > now.getTime() - 30 * DAY)
    .reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Unit Economics" title="Company Costs" />

      <MetricGrid columns={3}>
        <MetricCard
          id="mrr" label="Monthly revenue" value={fmtMoney(mrr)} icon={CircleDollarSign} tone="green"
          trend={addedThisMonth ? { text: `+${fmtMoney(addedThisMonth)} this month`, direction: "up", good: true } : flat("Sum of plan prices")}
          series={revenueSeries} seriesLabel="Monthly revenue as companies were onboarded, last 12 weeks"
        />
        <MetricCard
          id="cost" label="Monthly cost" value={fmtMoney(cost)} icon={Wallet} tone="amber" trend={flat("What we spend running them")}
          series={costSeries} seriesLabel="Monthly running cost as companies were onboarded, last 12 weeks"
        />
        <MetricCard
          id="net" label="Net margin / mo" value={fmtMoney(net)} icon={PiggyBank} tone={net >= 0 ? "teal" : "red"}
          trend={mrr ? { text: `${Math.round((net / mrr) * 100)}% margin`, direction: net >= 0 ? "up" : "down", good: net >= 0 } : flat("Nothing billed yet")}
          series={netSeries} seriesLabel="Net monthly margin as companies were onboarded, last 12 weeks"
        />
      </MetricGrid>

      <Panel title="By company" count={`${withMoney.length} companies`} subtitle="What each company pays, what it costs us to run, and the difference.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair bg-[#fafafc] text-left text-[13px] font-semibold text-ink">
                <th className="px-5 py-3 font-semibold">Company</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 text-right font-semibold">Revenue / mo</th>
                <th className="px-5 py-3 text-right font-semibold">Cost / mo</th>
                <th className="px-5 py-3 text-right font-semibold">Margin / mo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {withMoney.map((r) => (
                <tr key={r.id} className="hover:bg-black/[0.015]">
                  <td className="px-5 py-4 font-semibold">{r.company}</td>
                  <td className="px-5 py-4 text-dim">{planLabel[r.plan]}</td>
                  <td className="px-5 py-4 text-right mono">{fmtMoney(r.revenue)}</td>
                  <td className="px-5 py-4 text-right mono">{fmtMoney(r.monthlyCost)}</td>
                  <td className={`px-5 py-4 text-right mono font-semibold ${r.margin >= 0 ? "text-[#15a34a]" : "text-[#f4502f]"}`}>
                    {fmtMoney(r.margin)}
                  </td>
                </tr>
              ))}
              {withMoney.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-dim">Onboard a company to see its economics.</td>
                </tr>
              )}
            </tbody>
            {withMoney.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-hair font-semibold">
                  <td className="px-5 py-4" colSpan={2}>Total</td>
                  <td className="px-5 py-4 text-right mono">{fmtMoney(mrr)}</td>
                  <td className="px-5 py-4 text-right mono">{fmtMoney(cost)}</td>
                  <td className={`px-5 py-4 text-right mono ${net >= 0 ? "text-[#15a34a]" : "text-[#f4502f]"}`}>{fmtMoney(net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Panel>
    </div>
  );
}
