/**
 * How the AI follow-up interview runs for a role — what a company can
 * choose, and the defaults a role has until it does. Stored on the role as
 * `job_roles.interview_config` (supabase/migrations/0014_interview_config.sql)
 * and read by candidate/backend when a candidate invited to the role reaches
 * the interview.
 *
 * The bounds and choices below mirror candidate/backend/internal/db/interview.go.
 * The backend re-checks every value and falls back to its default for
 * anything it doesn't recognise, so this file drifting can't break an
 * interview — but an option offered here and unknown there would silently
 * do nothing. Change both.
 */

export interface InterviewConfig {
  questions: number;
  tone: InterviewTone;
  /** BCP-47 tag — the language the interviewer asks in, and the candidate answers in. */
  language: string;
  answerSeconds: number;
}

export type InterviewTone = "neutral" | "friendly" | "rigorous";

export const INTERVIEW_QUESTIONS = { min: 2, max: 8 };
export const ANSWER_SECONDS = { min: 30, max: 600 };

export const INTERVIEW_TONES: { value: InterviewTone; label: string; hint: string }[] = [
  { value: "neutral", label: "Neutral", hint: "Plain and professional" },
  { value: "friendly", label: "Friendly", hint: "Warm and encouraging" },
  { value: "rigorous", label: "Rigorous", hint: "Direct, presses on specifics" },
];

export const INTERVIEW_LANGUAGES: { value: string; label: string }[] = [
  { value: "en-US", label: "English" },
  { value: "hi-IN", label: "Hindi" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "pt-BR", label: "Portuguese" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ar-SA", label: "Arabic" },
  { value: "zh-CN", label: "Mandarin Chinese" },
];

export const ANSWER_TIME_CHOICES: { value: number; label: string }[] = [
  { value: 60, label: "1 minute" },
  { value: 90, label: "1½ minutes" },
  { value: 120, label: "2 minutes" },
  { value: 180, label: "3 minutes" },
  { value: 300, label: "5 minutes" },
];

export const DEFAULT_INTERVIEW_CONFIG: InterviewConfig = {
  questions: 4,
  tone: "neutral",
  language: "en-US",
  answerSeconds: 120,
};

const between = (n: unknown, { min, max }: { min: number; max: number }) =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

/**
 * Whatever is stored (or submitted), with every missing or out-of-range
 * field replaced by its default — the same rule the backend applies, so the
 * form always shows what will actually happen.
 */
export function normalizeInterviewConfig(raw: unknown): InterviewConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof InterviewConfig, unknown>>;
  const d = DEFAULT_INTERVIEW_CONFIG;
  return {
    questions: between(r.questions, INTERVIEW_QUESTIONS) ? (r.questions as number) : d.questions,
    tone: INTERVIEW_TONES.some((t) => t.value === r.tone) ? (r.tone as InterviewTone) : d.tone,
    language: INTERVIEW_LANGUAGES.some((l) => l.value === r.language) ? (r.language as string) : d.language,
    answerSeconds: between(r.answerSeconds, ANSWER_SECONDS) ? (r.answerSeconds as number) : d.answerSeconds,
  };
}
