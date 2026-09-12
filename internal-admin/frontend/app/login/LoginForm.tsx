"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import { signIn, type LoginState } from "./actions";

const fieldCls =
  "w-full rounded-xl border border-hair bg-surface px-4 py-3 text-[14px] outline-none transition focus:border-accent";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full !rounded-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<LoginState, FormData>(signIn, { error: null });

  return (
    <form action={action} className="w-full max-w-sm space-y-3.5">
      {next && <input type="hidden" name="next" value={next} />}

      <input name="email" type="email" required autoComplete="username" placeholder="you@mindfries.ai" autoFocus className={fieldCls} />
      <input name="password" type="password" required autoComplete="current-password" placeholder="Password" className={fieldCls} />

      {state.error && (
        <p role="alert" className="rounded-xl bg-[#fdecef] px-3 py-2.5 text-center text-[13px] leading-relaxed text-[#a6203c]">
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  );
}
