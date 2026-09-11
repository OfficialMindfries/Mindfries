"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { deleteTarget, updateTarget } from "@/app/admin/targets/actions";
import { STAGES, dueLabel } from "@/lib/targets-rules";
import type { TargetCompany, TargetPriority, TargetSource, TargetStage } from "@/lib/types";
import { sourceLabel } from "./shared";
import { toast } from "../toast";

type Save = Parameters<typeof updateTarget>[1];

/**
 * One save and one pending flag, shared by every card below. The outcome is a
 * notification in the corner — the same for every card — rather than each
 * card growing its own "Saved" label and red error line.
 */
function useSave(id: string) {
  const [pending, start] = useTransition();
  const save = (patch: Save, done: string, after?: () => void) => {
    start(async () => {
      const res = await updateTarget(id, patch);
      if (res.ok) {
        toast.success(done);
        after?.();
      } else toast.error("Couldn't save that", res.error);
    });
  };
  return { pending, save };
}

const card = "hair-card p-5";
const cardTitle = "mb-3 text-sm font-semibold";

export function StageSelect({ target }: { target: TargetCompany }) {
  const { pending, save } = useSave(target.id);
  return (
    <div>
      <Select
        value={target.stage}
        disabled={pending}
        onChange={(e) => save({ stage: e.target.value as TargetStage }, `Moved to ${STAGES.find((s) => s.key === e.target.value)?.label}`)}
        aria-label="Stage"
        className="w-auto font-semibold"
      >
        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </Select>
    </div>
  );
}

/**
 * The card that matters most: what happens next, and by when. "Done" clears
 * it, which is deliberate — a finished step should leave the target visibly
 * without one ("No next step" is flagged in the list) until someone decides
 * what comes after it.
 */
export function NextStepCard({ target, today }: { target: TargetCompany; today: string }) {
  const { pending, save } = useSave(target.id);
  const [action, setAction] = useState(target.nextAction ?? "");
  const [due, setDue] = useState(target.nextActionDue ?? "");
  const dirty = action !== (target.nextAction ?? "") || due !== (target.nextActionDue ?? "");
  const nurture = target.stage === "nurture";

  return (
    <div className={card}>
      <div className="flex items-baseline justify-between">
        <div className={cardTitle}>{nurture ? "Revisit" : "Next step"}</div>
        {target.nextActionDue && (
          <span className={`text-xs font-semibold ${target.nextActionDue < today ? "text-[#f4502f]" : target.nextActionDue === today ? "text-[#b45309]" : "text-dim"}`}>
            {dueLabel(target.nextActionDue, today)}
          </span>
        )}
      </div>
      <div className="space-y-2">
        <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder={nurture ? "Why to revisit" : "e.g. Send the pilot proposal to Priya"} />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => save({ nextAction: action, nextActionDue: due }, "Next step saved")} disabled={pending || !dirty} className="flex-1">
          Save
        </Button>
        {(target.nextAction || target.nextActionDue) && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => save({ nextAction: "", nextActionDue: "" }, "Next step done", () => { setAction(""); setDue(""); })}
          >
            Done
          </Button>
        )}
      </div>
      {nurture && !target.nextActionDue && (
        <div className="mt-2 text-xs text-dim">Set a date so this comes back up instead of being forgotten.</div>
      )}
    </div>
  );
}

export function DetailsCard({ target, owners }: { target: TargetCompany; owners: string[] }) {
  const { pending, save } = useSave(target.id);
  const [form, setForm] = useState({
    name: target.name,
    website: target.website ?? "",
    priority: target.priority,
    source: target.source,
    owner: target.owner ?? "",
  });
  const dirty =
    form.name !== target.name || form.website !== (target.website ?? "") || form.priority !== target.priority ||
    form.source !== target.source || form.owner !== (target.owner ?? "");

  return (
    <div className={card}>
      <div className={cardTitle}>Details</div>
      <div className="space-y-3">
        <Field label="Company"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Website"><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="acme.io" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TargetPriority })}>
              <option value="A">A — top</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </Select>
          </Field>
          <Field label="Owner">
            <Input list="detail-owners" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Unassigned" />
            <datalist id="detail-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
          </Field>
        </div>
        <Field label="Source">
          <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as TargetSource })}>
            {(Object.keys(sourceLabel) as TargetSource[]).map((s) => <option key={s} value={s}>{sourceLabel[s]}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={() => save(form, "Details saved")} disabled={pending || !dirty}>Save details</Button>
      </div>
    </div>
  );
}

export function NotesCard({ target }: { target: TargetCompany }) {
  const { pending, save } = useSave(target.id);
  const [why, setWhy] = useState(target.whyTarget);
  const [notes, setNotes] = useState(target.notes);
  const dirty = why !== target.whyTarget || notes !== target.notes;

  return (
    <div className={card}>
      <div className={cardTitle}>Why &amp; notes</div>
      <div className="space-y-3">
        <Field label="Why they're a target">
          <Textarea rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="What makes this worth pursuing now" />
        </Field>
        <Field label="Research notes" hint="Pain points, objections, who reports to whom — anything the next person needs.">
          <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={() => save({ whyTarget: why, notes }, "Notes saved")} disabled={pending || !dirty}>Save notes</Button>
      </div>
    </div>
  );
}

export function DeleteTarget({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete ${name}, its people and its whole history? This can't be undone.`)) return;
        start(async () => {
          const res = await deleteTarget(id);
          if (res.ok) router.push("/admin/targets");
          else toast.error("Couldn't delete it", res.error);
        });
      }}
      className="btn-wipe px-4 py-2 text-[13px] font-extrabold"
      style={{ "--btn-bg": "#fdecef", "--btn-fg": "#a6203c", "--btn-fill": "var(--color-accent-2)", "--btn-fg-hover": "#ffffff" } as React.CSSProperties}
    >
      Delete target
    </button>
  );
}
