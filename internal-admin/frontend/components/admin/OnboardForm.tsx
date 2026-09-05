"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { planLabel } from "@/lib/format";
import type { Plan } from "@/lib/types";
import { onboardCompany } from "@/app/admin/actions";

export function OnboardForm() {
  const [company, setCompany] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [plan, setPlan] = useState<Plan>("starter");
  const [monthlyCost, setMonthlyCost] = useState(0);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit() {
    start(async () => {
      const res = await onboardCompany({ company, adminEmail, plan, monthlyCost });
      if (res.ok) {
        setMsg({ ok: true, text: `Workspace created — credentials emailed to ${adminEmail}.` });
        setCompany(""); setAdminEmail(""); setPlan("starter"); setMonthlyCost(0);
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="hair-card p-5">
      <div className="mb-4 text-sm font-semibold">Onboard a company</div>
      {msg && (
        <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-[#15a34a]/10 text-[#15a34a]" : "bg-[#f4502f]/10 text-[#f4502f]"}`}>
          {msg.text}
        </div>
      )}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company"><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Robotics" /></Field>
          <Field label="Admin email" hint="Login + credentials are sent here."><Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@acme.io" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Plan">
            <Select value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
              {(Object.keys(planLabel) as Plan[]).map((p) => <option key={p} value={p}>{planLabel[p]}</option>)}
            </Select>
          </Field>
          <Field label="Monthly cost to us ($)" hint="Sandbox / compute we spend on them.">
            <Input type="number" min={0} value={monthlyCost} onChange={(e) => setMonthlyCost(Math.max(0, Number(e.target.value) || 0))} />
          </Field>
        </div>
        <Button onClick={submit} disabled={pending || !company.trim() || !adminEmail.trim()}>
          {pending ? "Creating…" : "Create & email credentials"}
        </Button>
      </div>
    </div>
  );
}
