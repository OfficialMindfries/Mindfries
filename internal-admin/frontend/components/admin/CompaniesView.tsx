"use client";

import { useState, useTransition } from "react";
import { Building2, CircleCheck, Hourglass } from "lucide-react";
import { MetricCard, MetricGrid, Panel, flat } from "@/components/admin/cards";
import { SampleBadge } from "@/components/admin/SampleBadge";
import { countWithin, cumulative, DAY, WEEK } from "@/lib/overview";
import type { Company, GameTemplate, MemberRole, Plan } from "@/lib/types";
import { Button, Field, Input, Modal, PageHeader, Pill, Select } from "@/components/ui";
import { companyTone, fmtDate, planLabel } from "@/lib/format";
import { inviteCandidate, onboardCompanyAccount, setCompanyStatusAction } from "@/app/admin/actions";
import { toast } from "@/components/admin/toast";

/**
 * `asOf` is decided on the server and passed in, so the server render and
 * the browser draw the same graphs; `sample` says the rows are fixtures —
 * same pattern as LibraryView. Real writes go through onboardCompanyAccount /
 * setCompanyStatusAction (app/admin/actions.ts) against the real `companies`
 * table; nothing here holds its own source of truth anymore.
 */
export function CompaniesView({
  initial,
  publishedTemplates,
  asOfIso,
  sample,
}: {
  initial: Company[];
  publishedTemplates: GameTemplate[];
  asOfIso: string;
  sample: boolean;
}) {
  const asOf = new Date(asOfIso);
  const [rows, setRows] = useState<Company[]>(initial);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  // onboarding form
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [plan, setPlan] = useState<Plan>("starter");
  const [seats, setSeats] = useState(5);
  const [emails, setEmails] = useState("");
  const [defaults, setDefaults] = useState<string[]>([]);
  const [activateNow, setActivateNow] = useState(true);

  function reset() {
    setName("");
    setWebsite("");
    setPlan("starter");
    setSeats(5);
    setEmails("");
    setDefaults([]);
    setActivateNow(true);
  }

  function toggleDefault(id: string) {
    setDefaults((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  }

  function onboard() {
    const parsed = emails
      .split(/[\n,]/)
      .map((e) => e.trim())
      .filter(Boolean);
    // The id here is a synthetic, display-only React key — createCompany's
    // input (below) doesn't take one, since the stored `team` jsonb column
    // only ever needed email/role; toCompany() synthesizes its own on read.
    const team = parsed.map((email, i) => ({ email, role: (i === 0 ? "admin" : "reviewer") as MemberRole }));
    const input = {
      name: name.trim(),
      website: website.trim(),
      plan,
      status: (activateNow ? "active" : "onboarding") as Company["status"],
      seats,
      team,
      defaultTemplateIds: defaults,
    };
    start(async () => {
      const res = await onboardCompanyAccount(input);
      if (!res.ok) {
        toast.error("Couldn't onboard the company", res.error);
        return;
      }
      toast.success("Company onboarded", input.name);
      // Optimistic — the persisted row (with its real id/createdAt) also
      // arrives on the next server render via revalidatePath.
      const optimisticTeam = team.map((m, i) => ({ ...m, id: String(i) }));
      setRows((r) => [{ ...input, team: optimisticTeam, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...r]);
      reset();
      setOpen(false);
    });
  }

  function cyclePause(c: Company) {
    const next = c.status === "paused" ? "active" : c.status === "active" ? "paused" : "active";
    setRows((r) => r.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
    start(async () => {
      const res = await setCompanyStatusAction(c.id, next);
      if (!res.ok) toast.error("Couldn't update the company", res.error);
    });
  }

  // Invite-a-candidate form — the one piece of the invitation flow that
  // wasn't reachable from anywhere but a direct database write until this
  // pass. `inviteFor` is which company's modal is open; null means closed.
  const [inviteFor, setInviteFor] = useState<Company | null>(null);
  const [inviteTemplateId, setInviteTemplateId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [inviteDue, setInviteDue] = useState("");

  function openInvite(c: Company) {
    setInviteFor(c);
    setInviteTemplateId(publishedTemplates[0]?.id ?? "");
    setInviteEmail("");
    setInviteName("");
    setInviteRole("");
    setInviteDue("");
  }

  function invite() {
    if (!inviteFor) return;
    const company = inviteFor;
    start(async () => {
      const res = await inviteCandidate({
        companyId: company.id,
        templateId: inviteTemplateId,
        candidateEmail: inviteEmail,
        candidateName: inviteName.trim() || undefined,
        role: inviteRole.trim() || undefined,
        dueDate: inviteDue || undefined,
      });
      if (!res.ok) {
        toast.error("Couldn't send the invitation", res.error);
        return;
      }
      toast.success("Candidate invited", `${inviteEmail} → ${company.name}`);
      setInviteFor(null);
    });
  }

  const active = rows.filter((c) => c.status === "active").length;
  const onboarding = rows.filter((c) => c.status === "onboarding").length;
  const newThisMonth = countWithin(rows.map((c) => c.createdAt), asOf, 30 * DAY);

  return (
    <>
      <PageHeader
        eyebrow="Company Onboarding"
        title="Companies"
        action={
          <div className="flex items-center gap-3">
            {sample && <SampleBadge asOf={asOf} />}
            <Button onClick={() => setOpen(true)}>+ Onboard company</Button>
          </div>
        }
      />

      <MetricGrid columns={3}>
        <MetricCard
          id="total" label="Total companies" value={rows.length} icon={Building2} tone="violet"
          trend={newThisMonth ? { text: `+${newThisMonth} this month`, direction: "up", good: true } : flat("None new this month")}
          series={cumulative(rows.map((c) => c.createdAt), asOf, 12, WEEK)} seriesLabel="Companies, running total over the last 12 weeks"
        />
        <MetricCard
          id="active" label="Active" value={active} icon={CircleCheck} tone="green"
          trend={flat(`${rows.filter((c) => c.status === "paused").length} paused`)}
          series={cumulative(rows.filter((c) => c.status === "active").map((c) => c.createdAt), asOf, 12, WEEK)} seriesLabel="Active companies, running total over the last 12 weeks"
        />
        <MetricCard id="onboarding" label="Onboarding" value={onboarding} icon={Hourglass} tone="amber" trend={flat(onboarding ? "Setting up now" : "None in progress")} />
      </MetricGrid>

      <Panel title="All companies" count={`${rows.length} total`} subtitle="Every company account, its plan, team and starting games.">
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-dim">No companies onboarded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hair bg-[#fafafc] text-left text-[13px] font-semibold text-ink">
                  <th className="px-5 py-3 font-semibold">Company</th>
                  <th className="px-5 py-3 font-semibold">Plan</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Seats</th>
                  <th className="px-5 py-3 font-semibold">Team</th>
                  <th className="px-5 py-3 font-semibold">Defaults</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hair">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-black/[0.015]">
                    <td className="px-5 py-4">
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-dim">{c.website}</div>
                    </td>
                    <td className="px-5 py-4">{planLabel[c.plan]}</td>
                    <td className="px-5 py-4">
                      <Pill tone={companyTone[c.status]}>{c.status}</Pill>
                    </td>
                    <td className="px-5 py-4 mono">{c.seats}</td>
                    <td className="px-5 py-4 mono">{c.team.length}</td>
                    <td className="px-5 py-4 mono">{c.defaultTemplateIds.length}</td>
                    <td className="px-5 py-4 text-dim">{fmtDate(c.createdAt)}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openInvite(c)}
                          disabled={pending || publishedTemplates.length === 0}
                          title={publishedTemplates.length === 0 ? "No published assessments to invite someone to yet" : undefined}
                          className="rounded-lg border border-hair px-3 py-1.5 text-xs font-semibold text-dim hover:border-hair-bright hover:text-ink disabled:opacity-50"
                        >
                          Invite
                        </button>
                        <button
                          onClick={() => cyclePause(c)}
                          disabled={pending}
                          className="rounded-lg border border-hair px-3 py-1.5 text-xs font-semibold text-dim hover:border-hair-bright hover:text-ink disabled:opacity-50"
                        >
                          {c.status === "paused" ? "Activate" : c.status === "active" ? "Pause" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Onboard company"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onboard} disabled={!name.trim() || pending}>
              {pending ? "Saving…" : activateNow ? "Create & activate" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Robotics" />
            </Field>
            <Field label="Website">
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="acme.io" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Plan / tier">
              <Select value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
                {(Object.keys(planLabel) as Plan[]).map((p) => (
                  <option key={p} value={p}>
                    {planLabel[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seats">
              <Input
                type="number"
                min={1}
                value={seats}
                onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          </div>
          <Field label="Team members" hint="One email per line. The first becomes the company admin; the rest are reviewers.">
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              rows={3}
              placeholder={"admin@acme.io\nreviewer@acme.io"}
              className="w-full rounded-xl border border-hair bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent focus:bg-surface"
            />
          </Field>
          <Field label="Default assessment templates" hint="What this company can pick from on day one.">
            <div className="space-y-2">
              {publishedTemplates.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-hair px-3 py-2 hover:border-hair-bright">
                  <input
                    type="checkbox"
                    checked={defaults.includes(t.id)}
                    onChange={() => toggleDefault(t.id)}
                    className="h-4 w-4 accent-[#7c3aed]"
                  />
                  <span className="text-sm font-medium">{t.name}</span>
                </label>
              ))}
            </div>
          </Field>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={activateNow}
              onChange={(e) => setActivateNow(e.target.checked)}
              className="h-4 w-4 accent-[#7c3aed]"
            />
            <span className="text-sm font-medium">Activate immediately</span>
          </label>
        </div>
      </Modal>

      <Modal
        open={inviteFor !== null}
        onClose={() => setInviteFor(null)}
        title={inviteFor ? `Invite a candidate — ${inviteFor.name}` : "Invite a candidate"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteFor(null)}>
              Cancel
            </Button>
            <Button onClick={invite} disabled={!inviteTemplateId || !inviteEmail.trim() || pending}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Assessment">
            <Select value={inviteTemplateId} onChange={(e) => setInviteTemplateId(e.target.value)}>
              {publishedTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Candidate email">
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Candidate name" hint="Optional">
              <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Jane Doe" />
            </Field>
            <Field label="Role" hint="Optional — shown on the candidate's dashboard">
              <Input value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} placeholder="Backend Engineer" />
            </Field>
          </div>
          <Field label="Due date" hint="Optional">
            <Input type="date" value={inviteDue} onChange={(e) => setInviteDue(e.target.value)} />
          </Field>
          <p className="text-xs text-dim">
            Shows up the next time {inviteEmail.trim() || "the candidate"} loads their dashboard — no email is sent yet
            (see task.md: the PRD&apos;s candidate/company transactional email doesn&apos;t exist).
          </p>
        </div>
      </Modal>
    </>
  );
}
