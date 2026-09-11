import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill } from "@/components/ui";
import { Contacts } from "@/components/admin/targets/Contacts";
import { DeleteTarget, DetailsCard, NextStepCard, NotesCard, StageSelect } from "@/components/admin/targets/Editors";
import { LogTouch } from "@/components/admin/targets/LogTouch";
import { channelIcon, outcomeLabel, priorityTone, sourceLabel } from "@/components/admin/targets/shared";
import { isMissingTables, targetsStore } from "@/lib/targets-store";
import { SchemaNotice } from "@/components/admin/targets/SchemaNotice";
import { addWorkingDays, channelLabel, FOLLOW_UP_WORKING_DAYS, isGoingCold, websiteHost, whenLabel } from "@/lib/targets-rules";
import { TEAM_TZ, teamToday } from "@/lib/team-time";

export const dynamic = "force-dynamic";

export default async function TargetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = targetsStore();

  // Reachable by deep link even when the list can't render, so it needs the
  // same setup guard. `notFound()` throws, so it stays outside the try.
  let target;
  try {
    target = await store.getTarget(id);
  } catch (e) {
    if (!isMissingTables(e)) throw e;
    return <SchemaNotice detail={e.message} />;
  }
  if (!target) notFound();

  const [contacts, activities, all] = await Promise.all([
    store.listContacts(id),
    store.listActivities(id),
    store.listTargets(),
  ]);
  const today = teamToday();
  const owners = [...new Set(all.map((t) => t.owner).filter((o): o is string => !!o))].sort();
  const people = new Map(contacts.map((c) => [c.id, c]));
  const host = websiteHost(target.website);

  // The hand-off to Onboarding once a deal is close or won, pre-filled from the
  // person most likely to be the admin: the decision-maker, else the champion,
  // else anyone with an email address.
  const admin =
    contacts.find((c) => c.persona === "decision_maker" && c.email) ??
    contacts.find((c) => c.persona === "champion" && c.email) ??
    contacts.find((c) => c.email);
  const onboardHref = `/admin/onboarding?${new URLSearchParams({
    company: target.name,
    targetId: target.id,
    ...(admin?.email ? { adminEmail: admin.email } : {}),
  })}`;

  return (
    <div className="space-y-6">
      <Link href="/admin/targets" className="text-sm font-semibold text-dim hover:text-ink">← All targets</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Pill tone={priorityTone[target.priority]}>Priority {target.priority}</Pill>
            <span className="text-xs text-dim">{sourceLabel[target.source]}</span>
            {isGoingCold(target, today, TEAM_TZ) && <Pill tone="amber">Going cold — no touch in 14 days</Pill>}
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{target.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-dim">
            {host && target.website && (
              <a href={target.website} target="_blank" rel="noreferrer" className="text-accent hover:underline">{host} ↗</a>
            )}
            <span>Owner: {target.owner ?? "unassigned"}</span>
            {target.leadId && <Link href="/admin/tracker" className="hover:text-ink">Linked to a Tracker lead</Link>}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <StageSelect target={target} />
          {["demo", "pilot", "won"].includes(target.stage) && (
            <Link href={onboardHref} className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:brightness-110">
              Onboard →
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <LogTouch
            targetId={target.id}
            contacts={contacts.map(({ id, name, role, doNotContact }) => ({ id, name, role, doNotContact }))}
            followUpDue={addWorkingDays(today, FOLLOW_UP_WORKING_DAYS)}
          />

          <div className="hair-card">
            <div className="border-b border-hair px-5 py-4 text-sm font-semibold">
              Timeline <span className="text-dim">{activities.length}</span>
            </div>
            {activities.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-dim">Nothing logged yet. Every touch you log shows up here.</div>
            ) : (
              <ol className="divide-y divide-hair">
                {activities.map((a) => {
                  const who = a.contactId ? people.get(a.contactId) : null;
                  return (
                    <li key={a.id} className="flex gap-3 px-5 py-4">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${a.direction === "inbound" ? "bg-[#15a34a]/12 text-[#15a34a]" : a.channel === "note" ? "bg-surface-2 text-dim" : "bg-accent-soft text-accent"}`}>
                        {channelIcon[a.channel]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <span className="font-semibold">
                            {a.channel === "note"
                              ? "Note"
                              : a.direction === "inbound"
                                ? `${who?.name ?? "They"} → us · ${channelLabel[a.channel]}`
                                : `Us → ${who?.name ?? target.name} · ${channelLabel[a.channel]}`}
                          </span>
                          {a.outcome && <Pill tone={a.outcome === "declined" ? "coral" : "green"}>{outcomeLabel[a.outcome]}</Pill>}
                        </div>
                        {a.summary && <p className="mt-1 whitespace-pre-wrap text-sm text-dim">{a.summary}</p>}
                        <div className="mt-1 text-xs text-faint" title={new Date(a.happenedAt).toLocaleString("en-GB", { timeZone: TEAM_TZ })}>
                          {whenLabel(a.happenedAt, today, TEAM_TZ)}{a.by ? ` · by ${a.by}` : ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Keyed on the saved values so a server refresh resets the form. */}
          <NextStepCard key={`${target.nextAction}|${target.nextActionDue}`} target={target} today={today} />
          <Contacts targetId={target.id} contacts={contacts} />
          <NotesCard key={`${target.whyTarget}|${target.notes}`} target={target} />
          <DetailsCard key={`${target.name}|${target.website}|${target.priority}|${target.owner}|${target.source}`} target={target} owners={owners} />
          <div className="text-right"><DeleteTarget id={target.id} name={target.name} /></div>
        </div>
      </div>
    </div>
  );
}
