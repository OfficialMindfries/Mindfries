"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { signUp, type SignUpState } from "@/app/signup/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tone="primary" size="lg" className="w-full !rounded-full" disabled={pending}>
      {pending ? "Creating account…" : "Create account"}
    </Button>
  );
}

/** Real — createAccount hashes the password and inserts a row in candidate_users, then signs the new account straight in. See lib/auth/users.ts. */
export function SignupForm() {
  const [state, action] = useActionState<SignUpState, FormData>(signUp, { error: null });

  return (
    <div className="w-full max-w-sm">
      <form action={action} className="space-y-3.5">
        <input
          name="name"
          type="text"
          required
          autoComplete="name"
          autoFocus
          placeholder="Full name"
          className="w-full rounded-xl border border-[#B3CFE5] bg-white px-4 py-3 text-[14px] text-[#0A1931] outline-none transition placeholder:text-[#4A7FA7]/70 focus:border-[#1A3D63]"
        />
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="you@company.com"
          className="w-full rounded-xl border border-[#B3CFE5] bg-white px-4 py-3 text-[14px] text-[#0A1931] outline-none transition placeholder:text-[#4A7FA7]/70 focus:border-[#1A3D63]"
        />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Password (at least 8 characters)"
          className="w-full rounded-xl border border-[#B3CFE5] bg-white px-4 py-3 text-[14px] text-[#0A1931] outline-none transition placeholder:text-[#4A7FA7]/70 focus:border-[#1A3D63]"
        />
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Confirm password"
          className="w-full rounded-xl border border-[#B3CFE5] bg-white px-4 py-3 text-[14px] text-[#0A1931] outline-none transition placeholder:text-[#4A7FA7]/70 focus:border-[#1A3D63]"
        />

        {state.error && (
          <p role="alert" className="text-center text-[12.5px] text-[#a6203c]">
            {state.error}
          </p>
        )}

        <Submit />

        <p className="text-center text-[12px] text-[#4A7FA7]">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[#1A3D63] hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
