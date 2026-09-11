import { listOnboarded } from "@/lib/db";
import { PageHeader, Pill, StatCard } from "@/components/ui";
import { OnboardForm } from "@/components/admin/OnboardForm";
import { companyTone, fmtDate, planLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

type Prefill = { company?: string; adminEmail?: string; targetId?: string };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Prefill> }) {
  const prefill = await searchParams;
  const rows = await listOnboarded();

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Conversion" title="Onboarding" />


      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Onboarded" value={rows.length} />
        <StatCard label="Active" value={rows.filter((r) => r.status === "active").length} />
        <StatCard label="Credentials sent" value={rows.filter((r) => r.credentialsSentAt).length} />
      </div>

      {/* Keyed so arriving from a different target re-seeds the form. */}
      <OnboardForm key={prefill.targetId ?? "blank"} initial={prefill} />

      <div className="hair-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-faint">
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
      </div>
    </div>
  );
}
