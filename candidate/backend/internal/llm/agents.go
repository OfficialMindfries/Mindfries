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

// conversationModel is the default for the candidate-facing agents — the
// workspace assistant, the interviewer and task generation. A Gemini model
// through OpenRouter (decided 2026-10-07); a Flash tier because two of the
// three are answering a person who is waiting.
const conversationModel = "google/gemini-3.8-flash"

// Reply ceilings per kind of call — see OpenRouterClient.Complete for why
// every call sets one. Sized to what each agent actually writes, with room
// to spare.
const (
	analysisTokens  = 2000 // an evidence agent's handful of paragraphs
	reportTokens    = 1000 // a recommendation and a short summary, as JSON
	assistantTokens = 800  // a concise answer in the workspace chat
	interviewTokens = 600  // one question
	taskGenTokens   = 6000 // a brief plus a small codebase
)

// AgentModels is which OpenRouter model slug each agent calls.
type AgentModels struct {
	CodeEvaluation string
	Reasoning      string
	Workflow       string
	Report         string
	// The candidate-facing agents (conversation.go).
	Assistant      string
	Interviewer    string
	TaskGeneration string
}

// DefaultAgentModels reads a per-agent override from the environment,
// falling back to defaultModel for whichever agents don't have one.
func DefaultAgentModels() AgentModels {
	pickOr := func(env, fallback string) string {
		if v := os.Getenv(env); v != "" {
			return v
		}
		return fallback
	}
	pick := func(env string) string { return pickOr(env, defaultModel) }
	return AgentModels{
		CodeEvaluation: pick("OPENROUTER_MODEL_CODE_EVAL"),
		Reasoning:      pick("OPENROUTER_MODEL_REASONING"),
		Workflow:       pick("OPENROUTER_MODEL_WORKFLOW"),
		Report:         pick("OPENROUTER_MODEL_REPORT"),
		Assistant:      pickOr("OPENROUTER_MODEL_ASSISTANT", conversationModel),
		Interviewer:    pickOr("OPENROUTER_MODEL_INTERVIEW", conversationModel),
		TaskGeneration: pickOr("OPENROUTER_MODEL_TASKGEN", conversationModel),
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
	return a.prose(ctx, a.models.CodeEvaluation, []ChatMessage{
		{Role: "system", Content: codeEvalSystemPrompt},
		{Role: "user", Content: diff},
	}, analysisTokens)
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
	return a.prose(ctx, a.models.Reasoning, []ChatMessage{
		{Role: "system", Content: reasoningSystemPrompt},
		{Role: "user", Content: eventsDigest},
	}, analysisTokens)
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
	return a.prose(ctx, a.models.Workflow, []ChatMessage{
		{Role: "system", Content: workflowSystemPrompt},
		{Role: "user", Content: eventsDigest},
	}, analysisTokens)
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
	raw, err := a.prose(ctx, a.models.Report, []ChatMessage{
		{Role: "system", Content: reportSystemPrompt},
		{Role: "user", Content: strings.Join(evidence, "\n\n---\n\n")},
	}, reportTokens)
	if err != nil {
		return ReportResult{}, err
	}

	var result ReportResult
	if err := json.Unmarshal([]byte(stripCodeFence(raw)), &result); err != nil {
		return ReportResult{Summary: raw}, nil
	}
	return result, nil
}

// stripCodeFence returns the JSON object inside a model reply: everything
// from the first "{" to the last "}". Models wrap JSON in code fences of
// varying shapes, or add a sentence before it, despite being asked not to —
// cheaper to cut the object out than to ask again over a formatting habit.
// A reply with no braces comes back trimmed and unchanged, and fails to
// parse on its own merits.
func stripCodeFence(s string) string {
	s = strings.TrimSpace(s)
	start, end := strings.Index(s, "{"), strings.LastIndex(s, "}")
	if start < 0 || end <= start {
		return s
	}
	return s[start : end+1]
}

// prose runs a completion whose reply is read by a person or another agent
// as text, where a reply cut off at the token ceiling is still usable.
func (a *Agents) prose(ctx context.Context, model string, messages []ChatMessage, maxTokens int) (string, error) {
	return keepPartial(a.client.Complete(ctx, model, messages, maxTokens))
}

// quickProse is prose for the candidate-facing agents, where someone is
// waiting on the reply — see OpenRouterClient.CompleteQuick.
func (a *Agents) quickProse(ctx context.Context, model string, messages []ChatMessage, maxTokens int) (string, error) {
	return keepPartial(a.client.CompleteQuick(ctx, model, messages, maxTokens))
}

func keepPartial(out string, err error) (string, error) {
	if errors.Is(err, ErrTruncated) && strings.TrimSpace(out) != "" {
		return out, nil
	}
	return out, err
}
