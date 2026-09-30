"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Input, Pill, Select } from "@/components/ui";
import { inviteTeammate, setTeammateStatus, type InviteTeammateState, type SetStatusState } from "./actions";
import type { CompanyRole, CompanyUser } from "@/lib/types";

const ROLE_LABEL: Record<CompanyRole, string> = { admin: "Admin", recruiter: "Recruiter", viewer: "Viewer" };

function InviteSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Inviting…" : "Invite"}
    </Button>
  );
}

function InviteForm() {
  const [state, action] = useActionState<InviteTeammateState, FormData>(inviteTeammate, { error: null, success: false });
  return (
    <form action={action} className="hair-card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-[160px] flex-1">
        <Field label="Name">
          <Input name="name" placeholder="Jane Doe" />
        </Field>
      </div>
      <div className="min-w-[220px] flex-1">
        <Field label="Email">
          <Input name="email" type="email" placeholder="jane@example.com" />
        </Field>
      </div>
      <div className="min-w-[140px]">
        <Field label="Role">
          <Select name="role" defaultValue="recruiter">
            <option value="admin">Admin</option>
            <option value="recruiter">Recruiter</option>
            <option value="viewer">Viewer</option>
          </Select>
        </Field>
      </div>
      <InviteSubmit />
      {state.error && (
        <p role="alert" className="w-full rounded-xl bg-[#fdecef] px-3 py-2 text-[13px] leading-relaxed text-[#a6203c]">
          {state.error}
        </p>
      )}
      {state.success && !state.error && (
        <p className="w-full text-[13px] text-[color:var(--color-success)]">
          {state.warning ?? "Invited."}
        </p>
      )}
    </form>
  );
}

function ToggleSubmit({ disabling }: { disabling: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={disabling ? "danger" : "soft"} disabled={pending} className="!px-3 !py-1.5 !text-[12px]">
      {pending ? "…" : disabling ? "Disable" : "Reactivate"}
    </Button>
  );
}

function StatusToggle({ user }: { user: CompanyUser }) {
  const disabling = user.status !== "disabled";
  const boundAction = setTeammateStatus.bind(null, user.id, disabling ? "disabled" : "active");
  const [state, action] = useActionState<SetStatusState, FormData>(boundAction, { error: null, success: false });

  return (
    <form action={action} className="flex items-center gap-2">
      <ToggleSubmit disabling={disabling} />
      {state.error && <span className="text-[12px] text-[#a6203c]">{state.error}</span>}
    </form>
  );
}

function statusTone(status: CompanyUser["status"]): "green" | "amber" | "gray" {
  if (status === "active") return "green";
  if (status === "invited") return "amber";
  return "gray";
}

export function TeamRoster({ users, currentEmail, canManage }: { users: CompanyUser[]; currentEmail: string; canManage: boolean }) {
  return (
    <div className="space-y-6">
      {canManage && <InviteForm />}

      <div className="hair-card divide-y divide-hair">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-6 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">
                {u.name}
                {u.email.toLowerCase() === currentEmail.toLowerCase() && (
                  <span className="ml-1.5 font-normal text-dim">(you)</span>
                )}
              </div>
              <div className="truncate text-xs text-dim">{u.email}</div>
            </div>
            <Pill tone="gray">{ROLE_LABEL[u.role]}</Pill>
            <Pill tone={statusTone(u.status)}>{u.status}</Pill>
            {canManage && u.email.toLowerCase() !== currentEmail.toLowerCase() && <StatusToggle user={u} />}
          </div>
        ))}
      </div>
    </div>
  );
}
