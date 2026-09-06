import { listWaitlist } from "@/lib/db";
import { PageHeader, StatCard } from "@/components/ui";
import { SetupBanner } from "@/components/admin/SetupBanner";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  const entries = await listWaitlist();
  const withCompany = entries.filter((e) => e.company).length;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Inbound" title="Waitlist">
        People who clicked “Join the waitlist” on the site and emailed us. Public form lives at{" "}
        <span className="mono">/waitlist</span>; each signup pings officemindfries@gmail.com.
      </PageHeader>

      <SetupBanner needsEmail />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Total signups" value={entries.length} />
        <StatCard label="With company" value={withCompany} />
        <StatCard label="This month" value={entries.filter((e) => e.createdAt.slice(0, 7) === new Date().toISOString().slice(0, 7)).length} />
      </div>

      <div className="hair-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-faint">
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
      </div>
    </div>
  );
}
