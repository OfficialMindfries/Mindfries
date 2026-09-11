"use client";

import { useState, useTransition } from "react";
import { Button, Input, Select } from "@/components/ui";
import { addContact, setDoNotContact } from "@/app/admin/targets/actions";
import type { ContactPersona, ContactWarmth, TargetContact } from "@/lib/types";
import { personaLabel, warmthLabel } from "./shared";
import { toast } from "../toast";

const blank = { name: "", role: "", email: "", linkedinUrl: "", persona: "decision_maker" as ContactPersona, warmth: "cold" as ContactWarmth };

/**
 * The people at a target. A deal usually needs several — someone who signs,
 * someone who champions it, someone who'll use it — so each carries their part
 * in the deal, not just a job title.
 *
 * "Do not contact" is one click and shown loudly, because it's the one field
 * here with a legal weight: once someone has asked to be left alone, the panel
 * refuses to log another outbound touch to them.
 */
export function Contacts({ targetId, contacts }: { targetId: string; contacts: TargetContact[] }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blank);
  const [pending, start] = useTransition();

  const add = () => {
    start(async () => {
      const res = await addContact(targetId, form);
      if (res.ok) {
        toast.success("Person added", form.name.trim());
        setForm(blank);
        setAdding(false);
      } else toast.error("Couldn't add them", res.error);
    });
  };

  const flag = (c: TargetContact) => {
    start(async () => {
      const res = await setDoNotContact(targetId, c.id, !c.doNotContact);
      if (!res.ok) toast.error("Couldn't update them", res.error);
      else if (!c.doNotContact) toast.info(`${c.name} marked do-not-contact`, "Outreach to them can no longer be logged.");
      else toast.info(`${c.name} can be contacted again`);
    });
  };

  return (
    <div className="hair-card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-sm font-semibold">People <span className="text-dim">{contacts.length}</span></div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-sm font-semibold text-accent hover:underline">
            + Add person
          </button>
        )}
      </div>

      {contacts.length === 0 && !adding && (
        <p className="text-sm text-dim">No one yet. Who signs off on hiring tools here — and who would champion it?</p>
      )}

      <ul className="space-y-3">
        {contacts.map((c) => (
          <li key={c.id} className={`rounded-xl border p-3 ${c.doNotContact ? "border-[#f6c2cb] bg-[#fff6f7]" : "border-hair"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{c.name}</div>
                {c.role && <div className="truncate text-xs text-dim">{c.role}</div>}
              </div>
              <div className="flex shrink-0 gap-1">
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-dim">{personaLabel[c.persona]}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-dim">{warmthLabel[c.warmth]}</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {c.email && <a href={`mailto:${c.email}`} className="text-accent hover:underline">{c.email}</a>}
              {c.linkedinUrl && (
                <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">LinkedIn ↗</a>
              )}
              <button
                type="button"
                onClick={() => flag(c)}
                disabled={pending}
                className={`ml-auto rounded-full px-2 py-0.5 font-semibold ${c.doNotContact ? "bg-[#d0304c] text-white" : "text-dim hover:bg-black/[0.05]"}`}
                title={c.doNotContact ? "They asked not to be contacted. Click to clear." : "Mark as asked not to be contacted"}
              >
                {c.doNotContact ? "Do not contact" : "Mark do-not-contact"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-3 space-y-2 rounded-xl border border-hair p-3">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" autoFocus />
          <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Role, e.g. Head of Talent" />
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
          <Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="LinkedIn URL" />
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value as ContactPersona })} aria-label="Part in the deal">
              {(Object.keys(personaLabel) as ContactPersona[]).map((p) => <option key={p} value={p}>{personaLabel[p]}</option>)}
            </Select>
            <Select value={form.warmth} onChange={(e) => setForm({ ...form, warmth: e.target.value as ContactWarmth })} aria-label="Warmth">
              {(Object.keys(warmthLabel) as ContactWarmth[]).map((w) => <option key={w} value={w}>{warmthLabel[w]}</option>)}
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={add} disabled={pending || !form.name.trim()} className="flex-1">{pending ? "Adding…" : "Add person"}</Button>
            <Button variant="ghost" onClick={() => { setAdding(false); setForm(blank); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
