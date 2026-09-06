"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { joinWaitlist } from "@/app/admin/actions";

export function WaitlistForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    start(async () => {
      const res = await joinWaitlist({ name, email, company, message });
      if (res.ok) setDone(true);
      else setErr(res.error);
    });
  }

  if (done) {
    return (
      <div className="hair-card p-8 text-center">
        <div className="text-2xl font-extrabold tracking-tight">You&apos;re on the list 🎉</div>
        <p className="mt-2 text-sm text-dim">We&apos;ll be in touch at {email} shortly.</p>
      </div>
    );
  }

  return (
    <div className="hair-card p-6">
      {err && <div className="mb-4 rounded-lg bg-[#f4502f]/10 px-3 py-2 text-sm text-[#f4502f]">{err}</div>}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></Field>
          <Field label="Work email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" /></Field>
        </div>
        <Field label="Company"><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Robotics" /></Field>
        <Field label="What are you hiring for?" hint="Optional"><Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
        <Button onClick={submit} disabled={pending || !email.trim()} className="w-full">
          {pending ? "Joining…" : "Join the waitlist"}
        </Button>
      </div>
    </div>
  );
}
