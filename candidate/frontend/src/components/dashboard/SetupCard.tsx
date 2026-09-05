import { ArrowRight, Check, Video } from "lucide-react";
import clsx from "clsx";
import { setupSteps } from "@/lib/dashboard/data";

/**
 * Mercor's numbered header stepper, merged with its "Important tasks" card.
 *
 * Splitting those two apart the way Mercor does means the bar tells you a
 * step is missing at the top of the screen and the card tells you what to do
 * about it further down. Here the next incomplete step *is* the task, so the
 * progress and the action sit in one place and the card disappears entirely
 * once setup is done.
 */

const COPY: Record<string, { title: string; body: string; cta: string }> = {
  "Environment check": {
    title: "Run the environment check",
    body: "Two minutes: camera, microphone, and whether your browser can run the workspace. Do it once, before your first real session — not five minutes before a deadline.",
    cta: "Start the check",
  },
  "Practice run": {
    title: "Take a practice run",
    body: "A real workspace with a throwaway task. Nothing from it is recorded, scored, or shared.",
    cta: "Open a practice run",
  },
  Profile: {
    title: "Finish your profile",
    body: "Companies see this alongside the evidence from your sessions.",
    cta: "Complete profile",
  },
};

export function SetupCard() {
  const next = setupSteps.find((step) => !step.done);
  const done = setupSteps.filter((step) => step.done).length;
  if (!next) return null;

  const copy = COPY[next.label];

  return (
    <section className="overflow-hidden rounded-2xl border border-[#B3CFE5] bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#B3CFE5] bg-[#B3CFE5]/20 px-5 py-3">
        {setupSteps.map((step, index) => (
          <div key={step.label} className="flex items-center gap-3">
            {index > 0 && <span className="h-px w-6 bg-[#B3CFE5]" aria-hidden />}
            <span className="flex items-center gap-2">
              <span
                className={clsx(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                  step.done
                    ? "bg-[#1A3D63] text-[#F6FAFD]"
                    : step === next
                      ? "bg-[#4A7FA7] text-[#F6FAFD]"
                      : "border border-[#B3CFE5] bg-white text-[#4A7FA7]"
                )}
              >
                {step.done ? <Check size={11} strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={clsx(
                  "text-xs",
                  step.done || step === next ? "font-medium text-[#0A1931]" : "text-[#4A7FA7]"
                )}
              >
                {step.label}
              </span>
            </span>
          </div>
        ))}
        <span className="ml-auto text-xs text-[#4A7FA7] tabular-nums">
          {done} of {setupSteps.length} done
        </span>
      </div>

      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B3CFE5]/40 text-[#1A3D63]">
          <Video size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[#0A1931]">{copy.title}</h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[#4A7FA7]">{copy.body}</p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#1A3D63] px-4 py-2.5 text-[13px] font-medium text-[#F6FAFD] transition-opacity hover:opacity-90"
        >
          {copy.cta}
          <ArrowRight size={14} />
        </button>
      </div>
    </section>
  );
}
