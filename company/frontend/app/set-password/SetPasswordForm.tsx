"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import { setPassword, type SetPasswordState } from "./actions";

const fieldCls =
  "w-full rounded-xl border border-hair bg-surface px-4 py-3 text-[14px] outline-none transition focus:border-accent";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full !rounded-full" disabled={pending}>
      {pending ? "Saving…" : "Set password and sign in"}
    </Button>
  );
}

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<SetPasswordState, FormData>(setPassword, { error: null });

  return (
    <form action={action} className="w-full max-w-sm space-y-3.5">
      <input type="hidden" name="token" value={token} />

      <input name="password" type="password" required autoComplete="new-password" placeholder="New password" autoFocus className={fieldCls} />
      <input name="confirm" type="password" required autoComplete="new-password" placeholder="Confirm password" className={fieldCls} />

      {state.error && (
        <p role="alert" className="rounded-xl bg-[#fdecef] px-3 py-2.5 text-center text-[13px] leading-relaxed text-[#a6203c]">
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  );
}
