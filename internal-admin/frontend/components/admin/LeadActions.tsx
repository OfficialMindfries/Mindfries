"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, Modal, Textarea } from "@/components/ui";
import { renderEmail, guessContactEmail, type EmailTemplate } from "@/lib/email-templates";
import type { Lead } from "@/lib/types";
import { sendLeadEmail, changeLeadStage } from "@/app/admin/actions";

export function LeadActions({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState<EmailTemplate | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function openCompose(template: EmailTemplate) {
    const r = renderEmail(template, lead);
    setTo(guessContactEmail(lead));
    setSubject(r.subject);
    setBody(r.body);
    setErr(null);
    setOpen(template);
  }

  function send() {
    if (!open) return;
    start(async () => {
      const res = await sendLeadEmail({ leadId: lead.id, template: open, to, subject, body });
      if (res.ok) setOpen(null);
      else setErr(res.error);
    });
  }

  function stage(s: Lead["stage"]) {
    start(async () => {
      await changeLeadStage(lead.id, s);
    });
  }

  const emailed = lead.stage !== "new";
  const btn = "rounded-lg border border-hair px-2.5 py-1.5 text-xs font-semibold text-dim hover:border-hair-bright hover:text-ink disabled:opacity-40";

  return (
    <div className="flex justify-end gap-1.5">
      {!emailed && (
        <button onClick={() => openCompose("demo")} disabled={pending} className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40">
          Email demo
        </button>
      )}
      {emailed && lead.stage !== "onboarded" && lead.stage !== "rejected" && (
        <button onClick={() => openCompose("poc")} disabled={pending} className={btn}>Send POC</button>
      )}
      {emailed && lead.stage !== "replied" && lead.stage !== "onboarded" && lead.stage !== "rejected" && (
        <button onClick={() => stage("replied")} disabled={pending} className={btn}>Mark replied</button>
      )}
      {lead.stage !== "rejected" && lead.stage !== "onboarded" && (
        <button onClick={() => stage("rejected")} disabled={pending} className={btn}>Reject</button>
      )}

      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open === "poc" ? `POC email — ${lead.company}` : `Demo email — ${lead.company}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
            <Button onClick={send} disabled={pending || !to.trim()}>{pending ? "Sending…" : "Send email"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {err && <div className="rounded-lg bg-[#f4502f]/10 px-3 py-2 text-sm text-[#f4502f]">{err}</div>}
          <Field label="To" hint={lead.contactEmail ? undefined : "Best-guess address — edit to the right contact."}>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="hello@company.com" />
          </Field>
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Body">
            <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
