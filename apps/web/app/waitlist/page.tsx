import { WaitlistForm } from "@/components/admin/WaitlistForm";

export const metadata = { title: "Join the Mindfries waitlist" };

export default function PublicWaitlistPage() {
  return (
    <main className="ambient min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-16">
        <div className="mb-8 flex items-center gap-3">
          <div className="tile tile-violet h-10 w-10 text-xl font-black">M</div>
          <span className="text-lg font-extrabold tracking-tight">Mindfries</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">Hire engineers on how they actually work.</h1>
        <p className="mt-3 max-w-md text-dim">
          Real sandboxed coding assessments with structured, rubric-based scoring. Join the waitlist and we&apos;ll set
          up a demo for your team.
        </p>
        <div className="mt-8">
          <WaitlistForm />
        </div>
      </div>
    </main>
  );
}
