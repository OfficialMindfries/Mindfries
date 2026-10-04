"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import { setRoleStatus, type SetRoleStatusState } from "./actions";
import type { RoleStatus } from "@/lib/types";

function Submit({ closing }: { closing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={closing ? "danger" : "soft"} disabled={pending} className="!px-3 !py-1.5 !text-[12px]">
      {pending ? "…" : closing ? "Close role" : "Reopen role"}
    </Button>
  );
}

export function RoleStatusToggle({ roleId, status }: { roleId: string; status: RoleStatus }) {
  const closing = status === "open";
  const boundAction = setRoleStatus.bind(null, roleId, closing ? "closed" : "open");
  const [state, action] = useActionState<SetRoleStatusState, FormData>(boundAction, { error: null, success: false });

  return (
    <form action={action} className="flex items-center gap-2">
      <Submit closing={closing} />
      {state.error && <span className="text-[12px] text-[#a6203c]">{state.error}</span>}
    </form>
  );
}
