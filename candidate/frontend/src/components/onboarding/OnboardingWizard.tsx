"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ConsentStep } from "@/components/onboarding/ConsentStep";
import { DeviceCheckStep } from "@/components/onboarding/DeviceCheckStep";
import { LobbyStep, type LobbyAssessment } from "@/components/onboarding/LobbyStep";
import { enterWorkspace } from "@/app/onboarding/actions";

interface OnboardingWizardProps {
  templateId: string | null;
  assessment: LobbyAssessment | null;
}

/**
 * Multi-step onboarding wizard that every candidate passes through before
 * entering the Engineering Workspace (PRD §1.5):
 *
 *   1. Identity & Consent  — recording disclosure + agreement
 *   2. Device & Camera     — verify the hardware is ready before the timer starts
 *   3. Instructions Lobby  — task overview + final "Enter Workspace" CTA
 *
 * Only on Step 3 does the server action fire (creating the live session in the
 * database and redirecting to /ide). Nothing is recorded until that point.
 *
 * templateId and assessment come from the page's own server-side lookup of
 * whichever assessment the candidate picked on the dashboard (?template=) —
 * this component never has its own idea of which assessment is running.
 */
export function OnboardingWizard({ templateId, assessment }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  const handleEnterWorkspace = () => {
    if (!templateId) return;
    setError(undefined);
    startTransition(async () => {
      const result = await enterWorkspace(templateId);
      // A successful call never returns — it redirects. Reaching here means
      // it failed and returned an error to show instead.
      if (result?.error) setError(result.error);
    });
  };

  if (!templateId || !assessment) {
    return (
      <div className="space-y-4 rounded-2xl border border-[#B3CFE5] bg-white p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-[#0A1931]">No assessment selected</h1>
        <p className="text-sm text-[#4A7FA7]">
          Start an assessment from your dashboard first — this page needs to know which one you&apos;re entering.
        </p>
        <Link
          href="/dashboard"
          className="btn-wipe inline-flex items-center justify-center gap-2 px-5 py-2.5 text-[13px] font-semibold"
          style={{ "--btn-bg": "#4A7FA7", "--btn-fg": "#F6FAFD", "--btn-fill": "#1A3D63", "--btn-fg-hover": "#FFFFFF" } as React.CSSProperties}
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6FAFD]">
      {/* Minimal top bar — no full nav, keeps focus on the flow */}
      <header className="border-b border-[#B3CFE5] bg-[#F6FAFD]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static local SVG */}
          <img src="/mindfries-logo.svg" alt="" width={22} height={22} />
          <span className="text-[14px] font-semibold tracking-tight text-[#0A1931]">Mindfries</span>
          <span className="ml-auto text-xs text-[#4A7FA7]">Step {step} of 3</span>
        </div>
      </header>

      {/* Step progress dots */}
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-5 pt-6">
        {([1, 2, 3] as const).map((n) => (
          <div
            key={n}
            className="h-1.5 flex-1 rounded-full transition-colors duration-300"
            style={{
              backgroundColor: step >= n ? "#1A3D63" : "#B3CFE5",
            }}
          />
        ))}
      </div>

      {/* Active step */}
      <main className="mx-auto max-w-2xl px-5 py-8">
        {step === 1 && <ConsentStep onContinue={() => setStep(2)} />}
        {step === 2 && <DeviceCheckStep onBack={() => setStep(1)} onContinue={() => setStep(3)} />}
        {step === 3 && (
          <LobbyStep
            assessment={assessment}
            onBack={() => setStep(2)}
            onEnter={handleEnterWorkspace}
            pending={isPending}
            error={error}
          />
        )}
      </main>
    </div>
  );
}
