"use client";

import { useState } from "react";
import { companies as seed, templates } from "@/lib/mock-data";
import type { Company, MemberRole, Plan } from "@/lib/types";
import { Button, Field, Input, Modal, PageHeader, Pill, Select, StatCard } from "@/components/ui";
import { companyTone, fmtDate, planLabel } from "@/lib/format";

const publishedTemplates = templates.filter((t) => t.status === "published");

export default function CompaniesPage() {
  const [rows, setRows] = useState<Company[]>(seed);
  const [open, setOpen] = useState(false);

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
    const team = parsed.map((email, i) => ({
      id: crypto.randomUUID(),
      email,
      role: (i === 0 ? "admin" : "reviewer") as MemberRole,
    }));
    const company: Company = {
      id: crypto.randomUUID(),
      name: name.trim(),
      website: website.trim(),
      plan,
      status: activateNow ? "active" : "onboarding",
      seats,
      team,
      defaultTemplateIds: defaults,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setRows((r) => [company, ...r]);
    reset();
    setOpen(false);
  }

  function cyclePause(id: string) {
    setRows((r) =>
      r.map((c) =>
        c.id === id ? { ...c, status: c.status === "paused" ? "active" : c.status === "active" ? "paused" : "active" } : c,
      ),
    );
  }

  const active = rows.filter((c) => c.status === "active").length;
  const onboarding = rows.filter((c) => c.status === "onboarding").length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Company Onboarding"
        title="Companies"
        action={<Button onClick={() => setOpen(true)}>+ Onboard company</Button>}
      >
        Create a company account, set its plan, assign its team, and provision the default assessment templates it
        starts with (PRD §1.11).
      </PageHeader>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total companies" value={rows.length} />
        <StatCard label="Active" value={active} />
        <StatCard label="Onboarding" value={onboarding} />
      </div>

      <div className="hair-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-faint">
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
                    <button
                      onClick={() => cyclePause(c.id)}
                      className="rounded-lg border border-hair px-3 py-1.5 text-xs font-semibold text-dim hover:border-hair-bright hover:text-ink"
                    >
                      {c.status === "paused" ? "Activate" : c.status === "active" ? "Pause" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Onboard company"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onboard} disabled={!name.trim()}>
              {activateNow ? "Create & activate" : "Create"}
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
    </div>
  );
}
