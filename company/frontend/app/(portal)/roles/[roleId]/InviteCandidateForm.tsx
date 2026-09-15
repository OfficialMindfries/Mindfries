"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Input } from "@/components/ui";
import { inviteCandidate, type InviteCandidateState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Inviting…" : "Invite candidate"}
    </Button>
  );
}

export function InviteCandidateForm({ roleId }: { roleId: string }) {
  const inviteToThisRole = inviteCandidate.bind(null, roleId);
  const [state, action] = useActionState<InviteCandidateState, FormData>(inviteToThisRole, { error: null, success: false });
  const formRef = useRef<HTMLFormElement>(null);

  // Uncontrolled inputs don't clear themselves on a successful submit — the
  // action returns the same shape either way, only `success` distinguishes
  // "just invited someone" from "hasn't submitted yet".
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="hair-card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-[200px] flex-1">
        <Field label="Candidate email">
          <Input name="candidateEmail" type="email" required placeholder="jane@example.com" />
        </Field>
      </div>
      <div className="min-w-[160px] flex-1">
        <Field label="Name" hint="Optional">
          <Input name="candidateName" placeholder="Jane Doe" />
        </Field>
      </div>
      <div className="w-40">
        <Field label="Due date" hint="Optional">
          <Input name="dueDate" type="date" />
        </Field>
      </div>
      <Submit />

      {state.error && (
        <p role="alert" className="w-full rounded-xl bg-[#fdecef] px-3 py-2 text-[13px] leading-relaxed text-[#a6203c]">
          {state.error}
        </p>
      )}
      {state.success && !state.error && <p className="w-full text-[13px] text-[color:var(--color-success)]">Invited.</p>}
    </form>
  );
}
