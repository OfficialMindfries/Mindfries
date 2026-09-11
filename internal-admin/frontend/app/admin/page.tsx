import Link from "next/link";
import { ArrowRight, Box, Bug, CodeXml, Database, Radio, TriangleAlert, Users, Zap, type LucideIcon } from "lucide-react";
import { companies, templates, sessions, SAMPLE_AS_OF } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui";
import { MetricCard, type Trend } from "@/components/admin/overview/MetricCard";
import { ago, countWithin, cumulative, DAY, HOUR, perBucket, WEEK } from "@/lib/overview";
import { todayIn } from "@/lib/targets-rules";
import { TEAM_TZ } from "@/lib/team-time";
import type { TaskVariant } from "@/lib/types";

/**
 * Everything the Mindfries team runs, at a glance.
 *
 * This page shows the sample fixtures in lib/mock-data, and says so in its
 * header — the trends and sparklines are real calculations, but over sample
 * records, and a "+2 today" with no label is exactly the kind of number that
 * gets quoted as fact. Trends are measured from the sample's own snapshot time
 * (SAMPLE_AS_OF), not from now; measured from now, they'd all read zero.
 */

const TREND_NONE = (text: string): Trend => ({ text, direction: "flat", good: true });

const VARIANT: Record<TaskVariant, { icon: LucideIcon; tile: string }> = {
  bug_fix: { icon: Bug, tile: "bg-[#fff0e8] text-[#d9601a]" },
  feature: { icon: Zap, tile: "bg-[#e3f7ec] text-[#1b8f4e]" },
  refactor: { icon: Database, tile: "bg-[#e7f0ff] text-[#2f6fe4]" },
  debug: { icon: CodeXml, tile: "bg-[#efeafd] text-[#7c3aed]" },
};

const AVATARS = ["bg-[#ffe9ea] text-[#c23a42]", "bg-[#fff1e3] text-[#c26410]", "bg-[#e7f0ff] text-[#2f5fc4]", "bg-[#efeafd] text-[#6a45d8]", "bg-[#e3f7ec] text-[#1b8f4e]"];
function avatarFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function SoftPill({ tone, children }: { tone: "red" | "green" | "gray"; children: React.ReactNode }) {
  const cls = {
    red: "border-[#fbd0d4] bg-[#fff1f2] text-[#d93a44]",
    green: "border-[#c5ecd5] bg-[#effbf4] text-[#1b8f4e]",
    gray: "border-hair bg-surface-2 text-dim",
  }[tone];
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export default function OverviewPage() {
  const asOf = new Date(SAMPLE_AS_OF);
  const today = todayIn(TEAM_TZ, asOf);
  const onDay = (iso: string) => todayIn(TEAM_TZ, new Date(iso)) === today;

  const active = companies.filter((c) => c.status === "active");
  const published = templates.filter((t) => t.status === "published");
  const live = sessions.filter((s) => s.status === "live");
  const attention = sessions.filter((s) => s.status === "stuck" || s.status === "failed");
  const recent = [...templates].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);

  const newCompanies = countWithin(active.map((c) => c.createdAt), asOf, 30 * DAY);
  const startedToday = sessions.filter((s) => onDay(s.startedAt)).length;
  const newGames = countWithin(published.map((t) => t.createdAt), asOf, 30 * DAY);
  const newProblems = attention.filter((s) => onDay(s.startedAt)).length;

  const snapshot = asOf.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TEAM_TZ });

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Mindfries Ops"
        title="Overview"
        action={
          <span
            title="These figures come from the sample fixtures in lib/mock-data, measured as of the sample's snapshot — not live data."
            className="inline-flex items-center gap-2 rounded-full border border-hair bg-surface px-3.5 py-2 text-xs font-semibold text-dim"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#d97706]" aria-hidden />
            Sample data · as of {snapshot}
          </span>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          id="companies"
          label="Active Companies"
          value={active.length}
          icon={Users}
          tone="violet"
          href="/admin/companies"
          trend={newCompanies ? { text: `+${newCompanies} this month`, direction: "up", good: true } : TREND_NONE("No new this month")}
          series={cumulative(active.map((c) => c.createdAt), asOf, 12, WEEK)}
          seriesLabel="Active companies, running total over the last 12 weeks"
        />
        <MetricCard
          id="sessions"
          label="Live Sessions"
          value={live.length}
          icon={Radio}
          tone="blue"
          href="/admin/sessions"
          trend={startedToday ? { text: `${startedToday} started today`, direction: "up", good: true } : TREND_NONE("None started today")}
          series={perBucket(sessions.map((s) => s.startedAt), asOf, 12, HOUR)}
          seriesLabel="Sessions started per hour, last 12 hours"
        />
        <MetricCard
          id="games"
          label="Published Games"
          value={published.length}
          icon={Box}
          tone="green"
          href="/admin/library"
          trend={newGames ? { text: `+${newGames} this month`, direction: "up", good: true } : TREND_NONE("None new this month")}
          series={cumulative(published.map((t) => t.createdAt), asOf, 12, WEEK)}
          seriesLabel="Published games, running total over the last 12 weeks"
        />
        <MetricCard
          id="attention"
          label="Needs Attention"
          value={attention.length}
          icon={TriangleAlert}
          tone="red"
          href="/admin/sessions"
          // Up is bad news here, so it's coloured as a warning, not a win.
          trend={
            attention.length === 0
              ? TREND_NONE("All clear")
              : newProblems
                ? { text: `+${newProblems} today`, direction: "up", good: false }
                : TREND_NONE("None new today")
          }
          series={cumulative(attention.map((s) => s.startedAt), asOf, 12, HOUR)}
          seriesLabel="Stuck or failed sessions, running total over the last 12 hours"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="hair-card lg:col-span-3">
          <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-extrabold tracking-tight">Needs attention</h2>
                {attention.length > 0 && <SoftPill tone="red">{attention.length} item{attention.length === 1 ? "" : "s"}</SoftPill>}
              </div>
              <p className="mt-1 text-sm text-dim">These sessions need your review or action.</p>
            </div>
            <Link href="/admin/sessions" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent hover:underline">
              View all <ArrowRight size={15} />
            </Link>
          </header>
          {attention.length === 0 ? (
            <div className="border-t border-hair px-6 py-12 text-center text-sm text-dim">All sessions healthy.</div>
          ) : (
            <ul className="divide-y divide-hair border-t border-hair">
              {attention.map((s) => (
                <li key={s.id} className="flex items-center gap-4 px-6 py-4">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold ${avatarFor(s.candidateName)}`}>
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
                    <div className="mt-1.5 text-xs text-faint">{ago(s.startedAt, asOf)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="hair-card lg:col-span-2">
          <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">Recent games</h2>
              <p className="mt-1 text-sm text-dim">Latest games and their status.</p>
            </div>
            <Link href="/admin/library" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent hover:underline">
              View library <ArrowRight size={15} />
            </Link>
          </header>
          <ul className="divide-y divide-hair border-t border-hair">
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
                    <div className="truncate text-xs text-dim">
                      used by {t.usedByCompanies} compan{t.usedByCompanies === 1 ? "y" : "ies"}
                    </div>
                  </div>
                  <SoftPill tone={t.status === "published" ? "green" : "gray"}>{t.status}</SoftPill>
                  <span className="w-20 shrink-0 text-right text-xs text-faint">{ago(t.createdAt, asOf)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
