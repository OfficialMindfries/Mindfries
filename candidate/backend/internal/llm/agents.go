package llm

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
)

// defaultModel is the PRD §2.4 open proposal — Claude as the primary model
// for the four non-interview agents, addressed by its OpenRouter slug. Still
// explicitly a *proposal* per the PRD, not a confirmed routing decision;
// override any single agent with the env vars in DefaultAgentModels the
// moment that's settled, without a code change.
const defaultModel = "anthropic/claude-sonnet-4.5"

// AgentModels is which OpenRouter model slug each agent calls.
type AgentModels struct {
	CodeEvaluation string
	Reasoning      string
	Workflow       string
	Report         string
}

// DefaultAgentModels reads a per-agent override from the environment,
// falling back to defaultModel for whichever agents don't have one.
func DefaultAgentModels() AgentModels {
	pick := func(env string) string {
		if v := os.Getenv(env); v != "" {
			return v
		}
		return defaultModel
	}
	return AgentModels{
		CodeEvaluation: pick("OPENROUTER_MODEL_CODE_EVAL"),
		Reasoning:      pick("OPENROUTER_MODEL_REASONING"),
		Workflow:       pick("OPENROUTER_MODEL_WORKFLOW"),
		Report:         pick("OPENROUTER_MODEL_REPORT"),
	}
}

// Agents wraps an OpenRouterClient with per-agent model routing and the
// system prompt that keeps each agent to its one job — PRD §1.9's
// "specialized agents, not one giant model."
type Agents struct {
	client *OpenRouterClient
	models AgentModels
}

// NewAgents builds the agent layer. client may be unconfigured (no API
// key) — every method below then returns ErrNotConfigured, same as the
// client itself.
func NewAgents(client *OpenRouterClient, models AgentModels) *Agents {
	return &Agents{client: client, models: models}
}

// Configured reports whether the underlying OpenRouter client has a key.
func (a *Agents) Configured() bool { return a.client.Configured() }

const codeEvalSystemPrompt = `You are the Code Evaluation agent in Mindfries' evidence-based hiring platform.
Read the candidate's code changes and judge the engineering behind them: correctness, design, test coverage, and how the change fits the existing codebase.
The platform's principle: don't just judge the candidate, collect evidence about how they worked. Write concrete, specific observations a hiring team could not have seen without this trail — not a score. One observation per paragraph, plain prose, no headers.`

// EvaluateCode reads a real diff (or the closest evidence available) and
// returns the Code Evaluation agent's observations.
func (a *Agents) EvaluateCode(ctx context.Context, diff string) (string, error) {
	if strings.TrimSpace(diff) == "" {
		return "", errors.New("llm: no code-change evidence available for this session")
	}
	return a.client.Complete(ctx, a.models.CodeEvaluation, []ChatMessage{
		{Role: "system", Content: codeEvalSystemPrompt},
		{Role: "user", Content: diff},
	})
}

const reasoningSystemPrompt = `You are the Reasoning agent in Mindfries' evidence-based hiring platform.
Given a chronological trail of a candidate's actions during an assessment (navigation, edits, terminal commands, test runs), explain WHY they likely moved the way they did — what they were investigating, what a pause or a re-read suggests, what a sequence of edits reveals about their mental model of the problem.
Write specific, evidence-grounded observations, not speculation dressed as certainty. One observation per paragraph, plain prose, no headers.`

// AnalyzeReasoning takes a text digest of a session's events and returns the
// Reasoning agent's read on why the candidate worked the way they did.
func (a *Agents) AnalyzeReasoning(ctx context.Context, eventsDigest string) (string, error) {
	if strings.TrimSpace(eventsDigest) == "" {
		return "", errors.New("llm: no event trail available for this session")
	}
	return a.client.Complete(ctx, a.models.Reasoning, []ChatMessage{
		{Role: "system", Content: reasoningSystemPrompt},
		{Role: "user", Content: eventsDigest},
	})
}

const workflowSystemPrompt = `You are the Workflow agent in Mindfries' evidence-based hiring platform.
Given a chronological trail of a candidate's actions during an assessment, describe the SHAPE of their session: how they navigated the codebase, how they used tests (before or after writing code, how often, in response to what), how they debugged when something failed, and how they used any AI assistant.
Write specific, evidence-grounded observations about working style, not a verdict. One observation per paragraph, plain prose, no headers.`

// AnalyzeWorkflow is AnalyzeReasoning's sibling — same input, a different
// lens on it (working style rather than intent).
func (a *Agents) AnalyzeWorkflow(ctx context.Context, eventsDigest string) (string, error) {
	if strings.TrimSpace(eventsDigest) == "" {
		return "", errors.New("llm: no event trail available for this session")
	}
	return a.client.Complete(ctx, a.models.Workflow, []ChatMessage{
		{Role: "system", Content: workflowSystemPrompt},
		{Role: "user", Content: eventsDigest},
	})
}

// ReportResult is the Report agent's structured output.
type ReportResult struct {
	Recommendation string `json:"recommendation"` // strong_hire|hire|lean_no|no_hire
	Summary        string `json:"summary"`
}

const reportSystemPrompt = `You are the Report agent in Mindfries' evidence-based hiring platform.
You are given the other agents' evidence — code evaluation, reasoning, and workflow observations — for one candidate's assessment session.
Compose it into a report a hiring team can act on: what the evidence shows, and a recommendation.
Reply with strict JSON only, no prose outside it, no markdown code fence:
{"recommendation": "strong_hire" | "hire" | "lean_no" | "no_hire", "summary": "2-4 sentences a hiring manager would actually read"}`

// GenerateReport composes labeled evidence strings (e.g. "Code Evaluation:\n...")
// into a final recommendation and summary. If the model's reply isn't valid
// JSON, the raw reply is kept as the summary with no recommendation, rather
// than discarding a real response over a formatting slip.
func (a *Agents) GenerateReport(ctx context.Context, evidence []string) (ReportResult, error) {
	if len(evidence) == 0 {
		return ReportResult{}, errors.New("llm: no evidence available to generate a report from")
	}
	raw, err := a.client.Complete(ctx, a.models.Report, []ChatMessage{
		{Role: "system", Content: reportSystemPrompt},
		{Role: "user", Content: strings.Join(evidence, "\n\n---\n\n")},
	})
	if err != nil {
		return ReportResult{}, err
	}

	var result ReportResult
	if err := json.Unmarshal([]byte(stripCodeFence(raw)), &result); err != nil {
		return ReportResult{Summary: raw}, nil
	}
	return result, nil
}

// stripCodeFence removes a leading/trailing ```json ... ``` fence if the
// model wrapped its JSON in one despite being asked not to — cheaper than
// asking the model again over a formatting habit.
func stripCodeFence(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}
