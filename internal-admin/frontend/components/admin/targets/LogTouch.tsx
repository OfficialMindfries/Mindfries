"use client";

import { useState, useTransition } from "react";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { logTouch } from "@/app/admin/targets/actions";
import { channelLabel } from "@/lib/targets-rules";
import type { TargetContact, TouchChannel, TouchDirection, TouchOutcome } from "@/lib/types";
import { outcomeLabel } from "./shared";
import { useActor } from "./useActor";
import { toast } from "../toast";

const CHANNELS: TouchChannel[] = ["email", "linkedin", "call", "meeting", "intro", "event", "note"];

/**
 * "Log a touch" — the one form the team will use every day, so it's built for
 * speed: channel, who, which way, what happened, and the next step.
 *
 * After an outbound touch the next step is pre-filled with a follow-up three
 * working days out, because a message with no follow-up behind it is how
 * outbound dies. It's a suggestion in plain sight — edit it, or untick it.
 * An inbound reply leaves any planned step alone unless you tick the box.
 */
export function LogTouch({
  targetId, contacts, followUpDue,
}: {
  targetId: string;
  contacts: Pick<TargetContact, "id" | "name" | "role" | "doNotContact">[];
  followUpDue: string;
}) {
  const [actor, setActor] = useActor();
  const [channel, setChannel] = useState<TouchChannel>("email");
  const [direction, setDirection] = useState<TouchDirection>("outbound");
  const [outcome, setOutcome] = useState<TouchOutcome>("replied");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [summary, setSummary] = useState("");
  const [when, setWhen] = useState(""); // empty = now
  // null = the default for this kind of touch; set once someone ticks or unticks.
  const [stepChoice, setStepChoice] = useState<boolean | null>(null);
  const [stepAction, setStepAction] = useState<string | null>(null); // null = use the suggestion
  const [stepDue, setStepDue] = useState(followUpDue);
  const [pending, start] = useTransition();

  const note = channel === "note";
  const outbound = !note && direction === "outbound";
  const contact = contacts.find((c) => c.id === contactId);
  const blocked = outbound && !!contact?.doNotContact;
  const suggestion = contact ? `Follow up with ${contact.name}` : "Follow up";
  // An outbound touch proposes a follow-up; a reply leaves the planned step
  // alone unless someone opts in. Switching kind of touch resets to that
  // kind's default rather than carrying a tick across.
  const settingStep = note ? false : (stepChoice ?? outbound);

  const submit = () => {
    start(async () => {
      const res = await logTouch(targetId, {
        channel,
        direction: note ? null : direction,
        outcome: note || direction === "outbound" ? null : outcome,
        contactId: contactId || null,
        summary,
        happenedAt: when ? new Date(when).toISOString() : null,
        by: actor,
        nextStep: settingStep ? { action: stepAction ?? suggestion, due: stepDue } : null,
      });
      if (res.ok) {
        setSummary("");
        setWhen("");
        setStepAction(null);
        setStepChoice(null);
        toast.success(note ? "Note added" : "Touch logged");
      } else toast.error(note ? "Note not added" : "Touch not logged", res.error);
    });
  };

  const seg = (on: boolean) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? "bg-surface text-ink shadow-sm" : "text-dim hover:text-ink"}`;

  return (
    <div className="hair-card p-5">
      <div className="mb-3 text-sm font-semibold">Log a touch</div>

      <div className="flex flex-wrap gap-1.5">
        {CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { setChannel(c); setStepChoice(null); }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${channel === c ? "border-accent bg-accent text-white" : "border-hair text-dim hover:text-ink"}`}
          >
            {channelLabel[c]}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {!note && (
          <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
            <button type="button" className={seg(direction === "outbound")} onClick={() => { setDirection("outbound"); setStepChoice(null); }}>We reached out</button>
            <button type="button" className={seg(direction === "inbound")} onClick={() => { setDirection("inbound"); setStepChoice(null); }}>They responded</button>
          </div>
        )}
        <Select value={contactId} onChange={(e) => setContactId(e.target.value)} aria-label="Person" className={note ? "sm:col-span-2" : ""}>
          <option value="">{contacts.length ? "Not a specific person" : "No people added yet"}</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.role ? ` — ${c.role}` : ""}{c.doNotContact ? " (do not contact)" : ""}
            </option>
          ))}
        </Select>
      </div>

      {!note && direction === "inbound" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(Object.keys(outcomeLabel) as TouchOutcome[]).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOutcome(o)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${outcome === o ? "border-ink bg-ink text-white" : "border-hair text-dim hover:text-ink"}`}
            >
              {outcomeLabel[o]}
            </button>
          ))}
        </div>
      )}

      <Textarea
        rows={3}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder={note ? "Research, context, an objection to remember…" : outbound ? "What you sent, and the angle" : "What they said"}
        className="mt-3"
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-dim">When (blank = now)</span>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-dim">By</span>
          <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Your name — remembered on this browser" />
        </label>
      </div>

      {!note && (
        <div className="mt-3 rounded-xl border border-hair p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={settingStep}
              onChange={() => setStepChoice(!settingStep)}
              className="h-4 w-4 accent-[#7c3aed]"
            />
            {outbound ? "Set the next step" : "Change the next step"}
          </label>
          {settingStep && (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input value={stepAction ?? suggestion} onChange={(e) => setStepAction(e.target.value)} aria-label="Next step" />
              <Input type="date" value={stepDue} onChange={(e) => setStepDue(e.target.value)} aria-label="Next step due" />
            </div>
          )}
        </div>
      )}

      {blocked && (
        <div className="mt-3 rounded-lg bg-[#fff0f2] px-3 py-2 text-sm text-[#d0304c]">
          {contact?.name} asked not to be contacted, so outreach to them can&apos;t be logged. If they&apos;ve
          since said it&apos;s fine, clear the flag on their card first.
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <Button onClick={submit} disabled={pending || blocked || (note && !summary.trim())}>
          {pending ? "Saving…" : note ? "Add note" : "Log touch"}
        </Button>
      </div>
    </div>
  );
}
