import "server-only";
import { db } from "./supabase";

/**
 * What the AI has actually cost, read from the `ai_cost` events
 * candidate/backend stores on a session every time it calls a model
 * (internal/orchestrator's recordUsage): the agent, the model, OpenRouter's
 * own token counts and the amount billed.
 *
 * These are real charges, not estimates — and only the ones made for a
 * session. Task generation in the Game Library belongs to no session, so it
 * is logged by the backend but doesn't appear here.
 */

export interface AiSpendRow {
  key: string;
  label: string;
  calls: number;
  tokens: number;
  costUsd: number;
}

export interface AiSpend {
  /** False when Supabase isn't configured or the read failed — distinct from a real zero. */
  available: boolean;
  totalUsd: number;
  calls: number;
  sessions: number;
  /** Average cost of one assessed session, across sessions that have any AI spend. */
  perSessionUsd: number;
  byAgent: AiSpendRow[];
  byCompany: AiSpendRow[];
}

const AGENT_LABELS: Record<string, string> = {
  assistant: "Workspace assistant",
  interviewer: "Interviewer",
  interviewer_live: "Interviewer (live voice)",
  code_evaluation: "Code evaluation",
  reasoning: "Reasoning analysis",
  workflow: "Workflow analysis",
  interview_analysis: "Interview analysis",
  rubric: "Rubric scoring",
  report: "Final report",
};

const EMPTY: AiSpend = { available: false, totalUsd: 0, calls: 0, sessions: 0, perSessionUsd: 0, byAgent: [], byCompany: [] };

// Enough for the product's current volume read in one go. Past this the
// totals would silently undercount, so the page says when the cap was hit.
export const AI_SPEND_ROW_CAP = 10_000;

export async function getAiSpend(): Promise<AiSpend & { capped: boolean }> {
  const c = db();
  if (!c) return { ...EMPTY, capped: false };

  const { data, error } = await c
    .from("activity_events")
    .select("session_id, payload, sessions(company_id, companies(name))")
    .eq("event_type", "ai_cost")
    .order("occurred_at", { ascending: false })
    .limit(AI_SPEND_ROW_CAP);
  if (error || !data) return { ...EMPTY, capped: false };

  const agents = new Map<string, AiSpendRow>();
  const companies = new Map<string, AiSpendRow>();
  const sessions = new Set<string>();
  let totalUsd = 0;

  const add = (map: Map<string, AiSpendRow>, key: string, label: string, tokens: number, cost: number) => {
    const row = map.get(key) ?? { key, label, calls: 0, tokens: 0, costUsd: 0 };
    row.calls += 1;
    row.tokens += tokens;
    row.costUsd += cost;
    map.set(key, row);
  };

  for (const row of data) {
    const p = (row.payload ?? {}) as { agent?: string; promptTokens?: number; completionTokens?: number; costUsd?: number };
    const cost = Number(p.costUsd) || 0;
    const tokens = (Number(p.promptTokens) || 0) + (Number(p.completionTokens) || 0);
    const agent = p.agent || "unknown";
    // Supabase types an embedded to-one relation as an array or an object depending on the client version.
    const session = (Array.isArray(row.sessions) ? row.sessions[0] : row.sessions) as
      | { company_id: string | null; companies: { name: string } | { name: string }[] | null }
      | null
      | undefined;
    const company = Array.isArray(session?.companies) ? session?.companies[0] : session?.companies;

    totalUsd += cost;
    sessions.add(row.session_id);
    add(agents, agent, AGENT_LABELS[agent] ?? agent, tokens, cost);
    add(companies, session?.company_id ?? "none", company?.name ?? "No company (open pool)", tokens, cost);
  }

  const byCost = (a: AiSpendRow, b: AiSpendRow) => b.costUsd - a.costUsd;
  return {
    available: true,
    totalUsd,
    calls: data.length,
    sessions: sessions.size,
    perSessionUsd: sessions.size ? totalUsd / sessions.size : 0,
    byAgent: [...agents.values()].sort(byCost),
    byCompany: [...companies.values()].sort(byCost),
    capped: data.length >= AI_SPEND_ROW_CAP,
  };
}

/** Model spend is cents and fractions of a cent — whole-dollar formatting would show $0 for everything. */
export function fmtUsdFine(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n < 1 ? 4 : 2, maximumFractionDigits: n < 1 ? 4 : 2 });
}
