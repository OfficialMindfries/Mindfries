package llm

import "context"

// Usage is what one model call cost, as OpenRouter reported it. Every call
// produces one, so spend can be attributed to the session — and through it,
// the candidate and company — that caused it, rather than only being visible
// as a running total on OpenRouter's dashboard.
type Usage struct {
	// Agent is which of this package's agents made the call, e.g.
	// "assistant" or "code_evaluation".
	Agent string `json:"agent"`
	// SessionID is the assessment session the call was made for. Empty for
	// calls that belong to no session (task generation in the admin library).
	SessionID string `json:"-"`
	Model     string `json:"model"`
	// PromptTokens and CompletionTokens are OpenRouter's own counts.
	// CompletionTokens includes any reasoning tokens — they're billed as output.
	PromptTokens     int `json:"promptTokens"`
	CompletionTokens int `json:"completionTokens"`
	// CostUSD is the charge for this call in US dollars, as billed.
	CostUSD float64 `json:"costUsd"`
}

type ctxKey int

const (
	ctxSession ctxKey = iota
	ctxAgent
)

// WithSession tags every model call made with ctx as belonging to a session.
func WithSession(ctx context.Context, sessionID string) context.Context {
	return context.WithValue(ctx, ctxSession, sessionID)
}

// withAgent names the agent making the calls under ctx. Set by each agent
// method itself, so a caller can't mislabel one.
func withAgent(ctx context.Context, agent string) context.Context {
	return context.WithValue(ctx, ctxAgent, agent)
}

func tagsFrom(ctx context.Context) (agent, sessionID string) {
	agent, _ = ctx.Value(ctxAgent).(string)
	sessionID, _ = ctx.Value(ctxSession).(string)
	return agent, sessionID
}
