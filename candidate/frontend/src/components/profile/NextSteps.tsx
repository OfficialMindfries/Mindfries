"use client";

import { ListChecks } from "lucide-react";
import { stats } from "@/lib/dashboard/data";
import { useProfileExtras } from "@/lib/profile/storage";
import { usePreviewMode } from "./PreviewMode";

/**
 * What's left to do, in the order it's worth doing it — the same idea as the
 * dashboard's SetupCard (a numbered checklist that IS the next action, not a
 * card describing one), applied to the profile instead of onboarding.
 *
 * Every item is a real signal, not a fixed script: it disappears the moment
 * its condition is true, and the card itself disappears once nothing's left,
 * exactly like SetupCard does when every step is done. A checklist that
 * still asks you to do something you've already done stops being trustworthy
 * the first time it's wrong.
 */
export function NextSteps() {
  const { resume, links } = useProfileExtras();
  const preview = usePreviewMode();
  const practiceRuns = stats.find((s) => s.kind === "practice")?.value ?? 0;

  // This is guidance for the candidate, not something a hiring team's view
  // needs to carry — the same reasoning ResumeUpload and LinkedAccounts use
  // to hide their own edit/connect affordances in preview mode.
  if (preview) return null;

  const remaining = [
    !resume && { title: "Upload your resume", body: "Help teams understand your background." },
    !links.github && !links.gitlab && { title: "Connect at least one code account", body: "GitHub or GitLab." },
    practiceRuns === 0 && { title: "Run a practice session", body: "Get comfortable with the environment." },
  ].filter((x): x is { title: string; body: string } => !!x);

  if (remaining.length === 0) return null;

  return (
    <section className="rounded-2xl bg-[#B3CFE5] p-5 shadow-[0_10px_24px_-14px_rgba(10,25,49,0.35)]">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0A1931]/10 text-[#0A1931]">
        <ListChecks size={17} />
      </span>
      <h2 className="mt-3 text-sm font-semibold text-[#0A1931]">Next steps</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#0A1931]/70">
        Finish setting up to get the most out of Mindfries.
      </p>

      <ol className="mt-4 space-y-3 border-t border-[#0A1931]/10 pt-4">
        {remaining.map((step, i) => (
          <li key={step.title} className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0A1931] text-[10.5px] font-semibold text-white">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#0A1931]">{step.title}</p>
              <p className="text-[11.5px] leading-snug text-[#0A1931]/70">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
