import { listOnboarded } from "@/lib/db";
import { PageHeader, StatCard } from "@/components/ui";
import { SetupBanner } from "@/components/admin/SetupBanner";
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

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Unit Economics" title="Company Costs">
        What each onboarded company bills us (plan) versus what it costs us to run (sandbox/compute), and the margin.
      </PageHeader>

      <SetupBanner />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="MRR" value={fmtMoney(mrr)} hint="Sum of plan prices" />
        <StatCard label="Monthly cost" value={fmtMoney(cost)} hint="What we spend running them" />
        <StatCard label="Net margin / mo" value={fmtMoney(net)} hint={mrr ? `${Math.round((net / mrr) * 100)}% margin` : undefined} />
      </div>

      <div className="hair-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-faint">
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
      </div>
    </div>
  );
}
