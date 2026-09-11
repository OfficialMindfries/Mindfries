"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { createTarget } from "@/app/admin/targets/actions";
import type { ContactPersona, TargetPriority, TargetSource } from "@/lib/types";
import { personaLabel, sourceLabel } from "./shared";
import { useActor } from "./useActor";
import { toast } from "../toast";

/**
 * "+ Add target". Captures what's worth knowing on day one — the company, why
 * it's a target, who's running it, and optionally the first person — and then
 * opens the target, where the rest of the work happens.
 */
export function AddTarget({ owners }: { owners: string[] }) {
  const router = useRouter();
  const [actor] = useActor();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [priority, setPriority] = useState<TargetPriority>("B");
  const [source, setSource] = useState<TargetSource>("other");
  const [owner, setOwner] = useState<string | null>(null); // null = "use my name"
  const [why, setWhy] = useState("");
  const [person, setPerson] = useState({ name: "", role: "", email: "", linkedinUrl: "", persona: "decision_maker" as ContactPersona });

  function reset() {
    setName(""); setWebsite(""); setPriority("B"); setSource("other"); setOwner(null); setWhy("");
    setPerson({ name: "", role: "", email: "", linkedinUrl: "", persona: "decision_maker" });
  }

  function submit() {
    start(async () => {
      const res = await createTarget({
        name, website, priority, source, owner: owner ?? actor, whyTarget: why,
        contact: person.name.trim() ? person : null,
      });
      if (!res.ok) {
        // A duplicate target comes with a way straight to the one that exists.
        const action = res.duplicate?.kind === "target" ? { label: "Open it", href: `/admin/targets/${res.duplicate.id}` } : undefined;
        toast.error("Target not added", res.error, { action });
        return;
      }
      toast.success("Target added", res.linkedLead ? `Linked to the Tracker lead for ${res.linkedLead}.` : name.trim());
      reset();
      setOpen(false);
      router.push(`/admin/targets/${res.id}`);
    });
  }

  return (
    <>
      {/* Dark pill, as in the table design this sits in. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white transition hover:bg-ink/85"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        Add target
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add target"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={pending || !name.trim()}>{pending ? "Adding…" : "Add target"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Razorpay" autoFocus />
            </Field>
            <Field label="Website">
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="razorpay.com" />
            </Field>
          </div>
          <Field label="Why they're a target" hint="The reason to pitch them now — what makes this worth your time.">
            <Textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Hiring 12 backend engineers after their Series C; CTO spoke about slow hiring loops at a meetup." />
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Priority">
              <Select value={priority} onChange={(e) => setPriority(e.target.value as TargetPriority)}>
                <option value="A">A — top</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </Select>
            </Field>
            <Field label="Source">
              <Select value={source} onChange={(e) => setSource(e.target.value as TargetSource)}>
                {(Object.keys(sourceLabel) as TargetSource[]).map((s) => <option key={s} value={s}>{sourceLabel[s]}</option>)}
              </Select>
            </Field>
            <Field label="Owner">
              <Input list="target-owners" value={owner ?? actor} onChange={(e) => setOwner(e.target.value)} placeholder="Your name" />
              <datalist id="target-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
            </Field>
          </div>

          <div className="rounded-xl border border-hair p-4">
            <div className="mb-3 text-xs font-semibold text-dim">First person to reach (optional)</div>
            <div className="grid grid-cols-2 gap-3">
              <Input value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder="Name" />
              <Input value={person.role} onChange={(e) => setPerson({ ...person, role: e.target.value })} placeholder="Role, e.g. VP Engineering" />
              <Input type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} placeholder="Email" />
              <Input value={person.linkedinUrl} onChange={(e) => setPerson({ ...person, linkedinUrl: e.target.value })} placeholder="LinkedIn URL" />
              <Select value={person.persona} onChange={(e) => setPerson({ ...person, persona: e.target.value as ContactPersona })} className="col-span-2">
                {(Object.keys(personaLabel) as ContactPersona[]).map((p) => <option key={p} value={p}>{personaLabel[p]}</option>)}
              </Select>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
