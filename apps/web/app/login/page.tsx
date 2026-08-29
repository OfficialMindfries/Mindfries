"use client";

import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="ambient grid min-h-screen place-items-center p-6">
      <div className="panel w-full max-w-sm p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="tile tile-violet h-10 w-10 text-xl font-black">M</div>
          <div>
            <div className="text-base font-extrabold tracking-tight">Mindfries</div>
            <div className="eyebrow mt-0.5">Internal Admin</div>
          </div>
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-dim">Mindfries team access only.</p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            router.push("/admin");
          }}
        >
          <Field label="Work email">
            <Input type="email" required placeholder="you@mindfries.ai" defaultValue="disha@mindfries.ai" />
          </Field>
          <Field label="Password">
            <Input type="password" required placeholder="••••••••" defaultValue="demo" />
          </Field>
          <Button type="submit" className="w-full">
            Sign in →
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-faint">
          Auth is stubbed for the MVP — wired to Clerk later (PRD §2.3).
        </p>
      </div>
    </div>
  );
}
