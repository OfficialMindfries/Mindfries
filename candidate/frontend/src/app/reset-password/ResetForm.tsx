"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { choosePassword, type ResetState } from "./actions";

const inputCls =
  "w-full rounded-xl border border-[#B3CFE5] bg-white px-4 py-3 text-[14px] text-[#0A1931] outline-none transition placeholder:text-[#4A7FA7]/70 focus:border-[#1A3D63]";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tone="primary" size="lg" className="w-full !rounded-full" disabled={pending}>
      {pending ? "Saving…" : "Set new password"}
    </Button>
  );
}

export function ResetForm({ token, minLength }: { token: string; minLength: number }) {
  const [state, action] = useActionState<ResetState, FormData>(choosePassword, { error: null });

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-5 text-center text-[17px] font-semibold text-[#0A1931]">Choose a new password</h1>
      <form action={action} className="space-y-3.5">
        <input type="hidden" name="token" value={token} />
        <input name="password" type="password" required minLength={minLength} autoComplete="new-password" autoFocus placeholder={`New password (${minLength}+ characters)`} className={inputCls} />
        <input name="confirm" type="password" required minLength={minLength} autoComplete="new-password" placeholder="Confirm new password" className={inputCls} />
        {state.error && (
          <p role="alert" className="text-center text-[12.5px] text-[#a6203c]">
            {state.error}
          </p>
        )}
        <Submit />
      </form>
    </div>
  );
}
