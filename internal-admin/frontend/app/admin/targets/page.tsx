import Link from "next/link";
import { PageHeader, StatCard } from "@/components/ui";
import { TargetsTable, type TargetRow } from "@/components/admin/targets/TargetsTable";
import { targetsStore } from "@/lib/targets-store";
import {
  ACTIVE, CLOSED, ENGAGED, STAGES, dueLabel, isDueToday, isGoingCold, isOverdue, sortForAttention,
  stageLabel, websiteHost,
} from "@/lib/targets-rules";
import { TEAM_TZ, teamToday } from "@/lib/team-time";
import type { TargetCompany, TargetStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

type Params = {
  view?: string; stage?: string; owner?: string; priority?: string; q?: string;
  sort?: string; dir?: string; page?: string;
};

// How far through the pipeline each stage is, for the progress bar. Lost and
// won are both "finished", so both fill the bar — the colour says which.
const PROGRESS: Record<TargetStage, number> = {
  researching: 8, contacted: 22, conversation: 40, meeting: 56, demo: 72, pilot: 88,
  won: 100, lost: 100, nurture: 15,
};
const BAR: Record<TargetStage, string> = {
  researching: "bg-[#5b4fd6]", contacted: "bg-[#5b4fd6]", conversation: "bg-[#5b4fd6]", meeting: "bg-[#5b4fd6]",
  demo: "bg-[#5b4fd6]", pilot: "bg-[#5b4fd6]", won: "bg-[#23894a]", lost: "bg-[#e5758a]", nurture: "bg-[#b9b9c6]",
};

// The logo tile: initials on a colour picked from the name. Deterministic, so
// a company keeps its colour. Real logos would mean sending every prospect's
// domain to a third-party favicon service, which isn't worth it for a tile.
const TILES = [
  "bg-[#e7f7ec] text-[#23894a]", "bg-[#fde8ef] text-[#c2275a]", "bg-[#e8f1fe] text-[#2f5fc4]",
  "bg-[#efeafd] text-[#6a45d8]", "bg-[#fff1e3] text-[#c26410]", "bg-[#e3f7f6] text-[#11807a]",
  "bg-[#fcecea] text-[#c23a2b]", "bg-[#eef0f4] text-[#4b5563]",
];
function tileFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILES[h % TILES.length];
}
function initialsOf(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}

const fullDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: TEAM_TZ });

function toRow(t: TargetCompany, today: string): TargetRow {
  const closed = CLOSED.includes(t.stage);
  const late = isOverdue(t, today);
  return {
    id: t.id,
    name: t.name,
    host: websiteHost(t.website),
    initials: initialsOf(t.name),
    tile: tileFor(t.name),
    priority: t.priority,
    owner: t.owner,
    stage: t.stage,
    stageLabel: stageLabel[t.stage],
    progress: PROGRESS[t.stage],
    bar: BAR[t.stage],
    lastTouchDate: t.lastTouchAt ? fullDate(t.lastTouchAt) : null,
    lastTouchSummary: t.lastTouchSummary,
    due:
      !closed && t.nextActionDue
        ? { label: dueLabel(t.nextActionDue, today), tone: late ? "red" : isDueToday(t, today) ? "amber" : "gray", action: t.nextAction }
        : null,
    noNextStep: !closed && t.stage !== "nurture" && !t.nextActionDue && !t.nextAction,
    cold: isGoingCold(t, today, TEAM_TZ),
  };
}

export default async function TargetsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const store = targetsStore();
  const [targets, contacts] = await Promise.all([store.listTargets(), store.listContacts()]);
  const today = teamToday();

  const peopleByTarget = new Map<string, string[]>();
  for (const c of contacts) peopleByTarget.set(c.targetId, [...(peopleByTarget.get(c.targetId) ?? []), c.name]);
  const owners = [...new Set(targets.map((t) => t.owner).filter((o): o is string => !!o))].sort();

  const dueNow = targets.filter((t) => isOverdue(t, today) || isDueToday(t, today));
  const overdue = targets.filter((t) => isOverdue(t, today));
  const cold = targets.filter((t) => isGoingCold(t, today, TEAM_TZ));
  const stageCounts = Object.fromEntries(STAGES.map((s) => [s.key, targets.filter((t) => t.stage === s.key).length])) as Record<TargetStage, number>;

  // Narrow: view, stage, owner, priority, then text across company and people.
  const q = (params.q ?? "").trim().toLowerCase();
  const matched = targets.filter((t) => {
    if (params.view === "due" && !(isOverdue(t, today) || isDueToday(t, today))) return false;
    if (params.view === "cold" && !isGoingCold(t, today, TEAM_TZ)) return false;
    if (params.stage && t.stage !== params.stage) return false;
    if (params.owner === "__none" ? !!t.owner : params.owner && t.owner !== params.owner) return false;
    if (params.priority && t.priority !== params.priority) return false;
    if (q) {
      const hay = [t.name, t.website ?? "", t.whyTarget, t.owner ?? "", ...(peopleByTarget.get(t.id) ?? [])].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Order: what needs attention first, unless a column sort was chosen.
  const asc = params.dir !== "desc";
  const ordered =
    params.sort === "name"
      ? [...matched].sort((a, b) => a.name.localeCompare(b.name) * (asc ? 1 : -1))
      : params.sort === "touch"
        ? [...matched].sort((a, b) => (a.lastTouchAt ?? "").localeCompare(b.lastTouchAt ?? "") * (asc ? 1 : -1))
        : sortForAttention(matched, today);

  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(params.page) || 1), pageCount);
  const rows = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((t) => toRow(t, today));

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Account-based outreach" title="Targets" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Being worked" value={targets.filter((t) => ACTIVE.includes(t.stage)).length} hint={`${stageCounts.nurture} nurturing`} />
        {/* The two cards worth acting on are links straight to that view. */}
        <Link href="/admin/targets?view=due" className="block rounded-[inherit] transition hover:-translate-y-0.5">
          <StatCard label="Due now →" value={dueNow.length} hint={overdue.length ? `${overdue.length} overdue` : "nothing overdue"} />
        </Link>
        <StatCard label="In conversation" value={targets.filter((t) => ENGAGED.includes(t.stage)).length} hint="replied, meeting, demo, pilot" />
        <StatCard label="Won" value={stageCounts.won} hint={`${stageCounts.lost} lost`} />
        <Link href="/admin/targets?view=cold" className="block rounded-[inherit] transition hover:-translate-y-0.5">
          <StatCard label="Going cold →" value={cold.length} hint="no touch in 14 days" />
        </Link>
      </div>

      <TargetsTable
          rows={rows}
          total={targets.length}
          matched={ordered.length}
          page={page}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
        owners={owners}
        stageCounts={stageCounts}
        query={params}
      />
    </div>
  );
}
