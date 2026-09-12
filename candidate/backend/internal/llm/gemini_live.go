package llm

import "errors"

// ErrInterviewNotImplemented is the AI Interview agent's honest status. This
// is deliberately not the same condition as ErrNotConfigured: even with a
// GEMINI_API_KEY present, there is no bidirectional audio bridge here yet.
//
// The PRD (§2.3, §1.9) settles the interview on Gemini's Live API specifically
// because it does real-time speech in and out over its own WebSocket — a
// protocol that needs a purpose-built proxy between the candidate's
// browser (mic in, speaker out) and Gemini, plus the interview's own
// turn-taking and interruption handling. That is a substantial, separate
// piece of work from the four text-and-code agents in agents.go, and
// building a version that only *looks* like it works would violate the
// same "real, or an honest failure" rule the rest of this codebase holds
// itself to. So: the interface exists so the orchestrator has somewhere to
// call into, and it says plainly that it isn't built yet.
var ErrInterviewNotImplemented = errors.New("llm: the AI Interview agent (Gemini Live API bridge) is not implemented yet")

// GeminiLiveConfig is what a real implementation will need: the key, and
// nothing else fixed yet, since the actual bridge (WebSocket relay, audio
// framing, turn-taking) doesn't exist to consume more configuration than
// that.
type GeminiLiveConfig struct {
	APIKey string
}

// InterviewSession is the shape the orchestrator will hold once a real
// bridge exists — defined now so the rest of the codebase (the session
// lifecycle, the WebSocket hub) has a stable interface to build against,
// without pretending the interview itself works today.
type InterviewSession interface {
	// Close ends the live interview connection.
	Close() error
}

// StartInterview is where a real implementation would open a WebSocket to
// Gemini's Live API and begin bridging the candidate's audio to it. Today it
// always returns ErrInterviewNotImplemented — configured or not.
func StartInterview(cfg GeminiLiveConfig) (InterviewSession, error) {
	return nil, ErrInterviewNotImplemented
}
