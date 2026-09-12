"use client";

import { useState } from "react";
import { ShieldCheck, Eye, Clock, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { HOW_EVIDENCE_IS_USED, RECORDED_SIGNALS, RETENTION, WHAT_IS_RECORDED } from "@/lib/policies";

interface ConsentStepProps {
  onContinue: () => void;
}

/**
 * Step 1: Identity & Consent.
 *
 * States plainly what is recorded and why. The framing is Mindfries' core
 * principle: we collect evidence about *how* the candidate worked, not just a
 * final score. The candidate must explicitly agree before proceeding.
 */
export function ConsentStep({ onContinue }: ConsentStepProps) {
  const [agreed, setAgreed] = useState(false);
  const [showSignals, setShowSignals] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#4A7FA7]">Step 1 — Consent</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#0A1931]">
          Before you start
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#4A7FA7]">
          This assessment captures how you work — not just your final code. Read this once before you begin.
        </p>
      </div>

      {/* Card: what we record */}
      <div className="rounded-2xl border border-[#B3CFE5] bg-white p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#B3CFE5]/40">
            <Eye size={16} className="text-[#1A3D63]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0A1931]">{WHAT_IS_RECORDED.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#4A7FA7]">{WHAT_IS_RECORDED.body}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSignals((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-[#B3CFE5] px-3 py-2 text-xs font-medium text-[#1A3D63] transition-colors hover:bg-[#B3CFE5]/20"
        >
          See exactly what is captured
          {showSignals ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showSignals && (
          <ul className="space-y-2 rounded-lg bg-[#F6FAFD] p-3">
            {RECORDED_SIGNALS.map((s) => (
              <li key={s.label} className="flex items-start gap-2.5">
                <span className="text-base leading-none">{s.icon}</span>
                <span>
                  <span className="text-xs font-medium text-[#0A1931]">{s.label}</span>
                  <span className="ml-1 text-xs text-[#4A7FA7]">— {s.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Card: how it's used */}
      <div className="rounded-2xl border border-[#B3CFE5] bg-white p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#B3CFE5]/40">
            <ShieldCheck size={16} className="text-[#1A3D63]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0A1931]">{HOW_EVIDENCE_IS_USED.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#4A7FA7]">{HOW_EVIDENCE_IS_USED.body}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#B3CFE5]/40">
            <Clock size={16} className="text-[#1A3D63]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#0A1931]">{RETENTION.title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#4A7FA7]">{RETENTION.body}</p>
          </div>
        </div>
      </div>

      {/* Agreement */}
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#B3CFE5] bg-white p-4 transition-colors hover:bg-[#F6FAFD]">
        <input
          id="consent-checkbox"
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-[#1A3D63]"
        />
        <span className="text-xs leading-relaxed text-[#0A1931]">
          I understand that my camera, code activity, and workspace behaviour will be recorded during this session,
          and I agree to proceed on this basis.
        </span>
      </label>

      {/* CTA */}
      <div className="flex justify-end">
        <Button id="consent-continue" type="button" disabled={!agreed} onClick={onContinue}>
          Continue
          <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}
