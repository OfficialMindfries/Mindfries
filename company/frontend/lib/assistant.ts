/**
 * What a company decides about the workspace AI assistant for a role:
 * whether candidates get one, and how many messages they may send it.
 * Stored on the role as `job_roles.assistant_config`
 * (supabase/migrations/0015_assistant_config.sql) and read by
 * candidate/backend each time a candidate invited to the role opens or uses
 * the assistant.
 *
 * The range below mirrors candidate/backend/internal/db/assistant.go. The
 * backend re-checks what's stored and falls back to its default for anything
 * out of range, so this file drifting can't break a session — change both.
 */

export interface AssistantConfig {
  enabled: boolean;
  /** How many messages a candidate may send the assistant in one session. */
  maxMessages: number;
}

export const ASSISTANT_MESSAGES = { min: 1, max: 60 };

export const ASSISTANT_MESSAGE_CHOICES: { value: number; label: string }[] = [
  { value: 5, label: "5 messages" },
  { value: 10, label: "10 messages" },
  { value: 20, label: "20 messages" },
  { value: 40, label: "40 messages" },
  { value: 60, label: "60 messages (the most allowed)" },
];

export const DEFAULT_ASSISTANT_CONFIG: AssistantConfig = { enabled: true, maxMessages: ASSISTANT_MESSAGES.max };

/**
 * Whatever is stored (or submitted), with anything missing or out of range
 * replaced by its default — the same rule the backend applies. A role nobody
 * has configured stores `{}`, which is "on": only an explicit `false` turns
 * the assistant off.
 */
export function normalizeAssistantConfig(raw: unknown): AssistantConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof AssistantConfig, unknown>>;
  const n = r.maxMessages;
  const inRange = typeof n === "number" && Number.isInteger(n) && n >= ASSISTANT_MESSAGES.min && n <= ASSISTANT_MESSAGES.max;
  return {
    enabled: r.enabled !== false,
    maxMessages: inRange ? n : DEFAULT_ASSISTANT_CONFIG.maxMessages,
  };
}
