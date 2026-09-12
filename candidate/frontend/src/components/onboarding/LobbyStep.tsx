"use client";

import { Clock, Terminal, Bot, GitBranch, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface LobbyAssessment {
  role: string;
  company: string;
  /** Short descriptors as they come off the assessment card — e.g. ["Bug Fix", "90 min", "Remote"]. Shown verbatim, nothing re-derived or guessed here. */
  tags: string[];
}

const RULES = [
  {
    icon: Clock,
    title: "Timer starts when you enter",
    body: "The countdown begins the moment you click \u201cEnter Workspace\u201d. The timer does not pause.",
  },
  {
    icon: Bot,
    title: "AI assistant is available",
    body: "You can use the built-in AI assistant to ask questions or think through approaches. How you use it is part of the evidence — use it naturally.",
  },
  {
    icon: Terminal,
    title: "Real environment",
    body: "You have a real terminal, a code editor, and a file explorer. Run tests, write files, use git — treat it like a real working environment.",
  },
  {
    icon: GitBranch,
    title: "Your work is captured continuously",
    body: "Every file change, terminal command, and test run is captured. The hiring team sees your process, not just the final state.",
  },
];

interface LobbyStepProps {
  assessment: LobbyAssessment;
  onBack: () => void;
  onEnter: () => void;
  pending: boolean;
  /** Set when a previous attempt to start the session failed — shown above the CTA so the candidate knows to retry rather than assume they're already in. */
  error?: string;
}

/**
 * Step 3: Instructions Lobby.
 *
 * The final screen before the clock starts. Shows the candidate what assessment
 * they are about to enter, the rules they need to know, and the "Enter Workspace"
 * button that fires the server action creating the live session.
 *
 * Deliberately calm and clear — the candidate should feel prepared, not pressured.
 */
export function LobbyStep({ assessment, onBack, onEnter, pending, error }: LobbyStepProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#4A7FA7]">Step 3 — Ready</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#0A1931]">
          You&apos;re good to go
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#4A7FA7]">
          Read through what to expect, then enter the workspace when you&apos;re ready.
        </p>
      </div>

      {/* Assessment card */}
      <div className="rounded-2xl border border-[#1A3D63] bg-[#0A1931] p-5 text-[#F6FAFD]">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#4A7FA7]">Your assessment</p>
        <h2 className="mt-2 text-lg font-semibold leading-snug">{assessment.role}</h2>
        <p className="mt-0.5 text-sm text-[#B3CFE5]">{assessment.company}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {assessment.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-[#1A3D63] px-2.5 py-1 text-xs font-medium text-[#B3CFE5]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Rules */}
      <div className="rounded-2xl border border-[#B3CFE5] bg-white divide-y divide-[#B3CFE5]/60">
        {RULES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3 p-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#B3CFE5]/30">
              <Icon size={15} className="text-[#1A3D63]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0A1931]">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[#4A7FA7]">{body}</p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-[#E4A0A0] bg-[#FBEAEA] px-4 py-3 text-center text-sm font-medium text-[#8A2C2C]">
          {error}
        </p>
      )}

      {/* Final CTA note */}
      <p className="text-center text-xs text-[#4A7FA7]">
        The timer starts when you click <strong className="text-[#0A1931]">Enter Workspace</strong>.
        Take a moment and enter only when you&apos;re ready.
      </p>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button tone="ghost" type="button" onClick={onBack} disabled={pending}>
          <ArrowLeft size={15} />
          Back
        </Button>
        {/* The one button that costs something to press — the timer starts
            here — so it gets the largest size on the flow. */}
        <Button
          id="enter-workspace"
          type="button"
          size="lg"
          onClick={onEnter}
          disabled={pending}
          style={pending ? { "--btn-bg": "#4A7FA7" } as React.CSSProperties : undefined}
        >
          {pending ? "Starting…" : "Enter Workspace"}
          {!pending && <ArrowRight size={15} />}
        </Button>
      </div>
    </div>
  );
}
