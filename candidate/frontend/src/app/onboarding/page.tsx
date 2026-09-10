"use client";

import { useState, useTransition } from "react";
import { ConsentStep } from "@/components/onboarding/ConsentStep";
import { DeviceCheckStep } from "@/components/onboarding/DeviceCheckStep";
import { LobbyStep } from "@/components/onboarding/LobbyStep";
import { enterWorkspace } from "@/app/onboarding/actions";

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
 */
export default function OnboardingPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isPending, startTransition] = useTransition();

  const handleEnterWorkspace = () => {
    startTransition(() => enterWorkspace());
  };

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
            onBack={() => setStep(2)}
            onEnter={handleEnterWorkspace}
            pending={isPending}
          />
        )}
      </main>
    </div>
  );
}
