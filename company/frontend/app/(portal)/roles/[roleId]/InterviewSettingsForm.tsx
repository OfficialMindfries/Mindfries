"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, Select } from "@/components/ui";
import {
  ANSWER_TIME_CHOICES,
  INTERVIEW_LANGUAGES,
  INTERVIEW_QUESTIONS,
  INTERVIEW_TONES,
  type InterviewConfig,
} from "@/lib/interview";
import { saveInterviewSettings, type InterviewSettingsState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

const questionCounts = Array.from(
  { length: INTERVIEW_QUESTIONS.max - INTERVIEW_QUESTIONS.min + 1 },
  (_, i) => INTERVIEW_QUESTIONS.min + i,
);

/**
 * How the AI follow-up interview runs for candidates invited to this role:
 * how many questions, in what tone and language, and how long each answer
 * may take. Applies to candidates who reach the interview after it's saved —
 * an interview already under way keeps the settings it started with only
 * for the questions already asked.
 */
export function InterviewSettingsForm({ roleId, config }: { roleId: string; config: InterviewConfig }) {
  const saveForThisRole = saveInterviewSettings.bind(null, roleId);
  const [state, action] = useActionState<InterviewSettingsState, FormData>(saveForThisRole, { error: null, success: false });

  // An answer limit set some other way (the API, an older form) stays
  // selectable rather than silently snapping to the nearest listed choice.
  const answerChoices = ANSWER_TIME_CHOICES.some((c) => c.value === config.answerSeconds)
    ? ANSWER_TIME_CHOICES
    : [...ANSWER_TIME_CHOICES, { value: config.answerSeconds, label: `${config.answerSeconds} seconds` }];

  return (
    <form action={action} className="hair-card space-y-3 p-4">
      <div>
        <div className="eyebrow">AI interview</div>
        <p className="mt-1 text-[13px] text-dim">
          After a candidate finishes the task, the AI interviewer asks them about their own work. Their answers are
          recorded and appear with the report.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Questions">
          <Select name="questions" defaultValue={String(config.questions)}>
            {questionCounts.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Time per answer">
          <Select name="answerSeconds" defaultValue={String(config.answerSeconds)}>
            {answerChoices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tone">
          <Select name="tone" defaultValue={config.tone}>
            {INTERVIEW_TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.hint}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Language">
          <Select name="language" defaultValue={config.language}>
            {INTERVIEW_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Submit />
        {state.success && !state.error && <p className="text-[13px] text-[color:var(--color-success)]">Saved.</p>}
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-[#fdecef] px-3 py-2 text-[13px] leading-relaxed text-[#a6203c]">
          {state.error}
        </p>
      )}
    </form>
  );
}
