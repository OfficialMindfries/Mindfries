"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { forgotPassword, type ForgotState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tone="primary" size="lg" className="w-full !rounded-full" disabled={pending}>
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState<ForgotState, FormData>(forgotPassword, { done: false, error: null });

  if (state.done) {
    return (
      <div className="w-full max-w-sm text-center">
        <h1 className="text-[17px] font-semibold text-[#0A1931]">Check your inbox</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#4A7FA7]">
          If that address has a Mindfries account, a link to choose a new password is on its way. It works once, for an hour.
        </p>
        <Link href="/login" className="mt-5 inline-block text-[13px] font-medium text-[#1A3D63] hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-center text-[17px] font-semibold text-[#0A1931]">Forgot your password?</h1>
      <p className="mt-1.5 mb-5 text-center text-[13px] text-[#4A7FA7]">Enter your email and we&apos;ll send a link to choose a new one.</p>
      <form action={action} className="space-y-3.5">
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          placeholder="you@company.com"
          className="w-full rounded-xl border border-[#B3CFE5] bg-white px-4 py-3 text-[14px] text-[#0A1931] outline-none transition placeholder:text-[#4A7FA7]/70 focus:border-[#1A3D63]"
        />
        {state.error && (
          <p role="alert" className="text-center text-[12.5px] text-[#a6203c]">
            {state.error}
          </p>
        )}
        <Submit />
        <p className="text-center text-[12px] text-[#4A7FA7]">
          <Link href="/login" className="font-medium text-[#1A3D63] hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
