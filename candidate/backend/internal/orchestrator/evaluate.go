package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/llm"
)

// How much of a session's evidence is put in front of a model at once. The
// trail grows with every file save, and it is sent to the interviewer on
// every question and to two analysis agents — unbounded, a long session
// costs several times a short one and can overflow a model's context
// outright. Past these sizes the middle is dropped and the cut is stated;
// the opening (how they approached it) and the end (what they finished
// with) are the parts worth keeping whole.
const (
	maxAnalysisTrailChars  = 24_000 // ≈ 6k tokens, read once each by Reasoning and Workflow
	maxInterviewTrailChars = 8_000  // ≈ 2k tokens, read again on every question
	maxWorkChars           = 40_000 // ≈ 10k tokens of changed files

	eventAICost             = "ai_cost"
	eventInterviewRecording = "interview_recording"
	// What an interview_recording event becomes once its file is deleted at
	// the end of retention (internal-admin/frontend/lib/retention.ts).
	eventRecordingExpired = "interview_recording_expired"
)

// Evaluate runs the Code Evaluation, Reasoning, Workflow and Interview
// agents over a session's recorded evidence, scores it against the
// template's rubric when it has one, then has the Report agent compose the
// result, and stores it all. If the agent layer isn't configured (no
// OPENROUTER_API_KEY), the report is saved as "failed" with that exact
// reason — never a fabricated recommendation.
func (o *Orchestrator) Evaluate(ctx context.Context, sessionID string) error {
	ctx = llm.WithSession(ctx, sessionID)
	report, err := o.DB.CreatePendingReport(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("orchestrator: creating report row: %w", err)
	}
	if err := o.DB.SetReportGenerating(ctx, report.ID); err != nil {
		return err
	}
	o.broadcast(sessionID, "report_generating", map[string]string{"sessionId": sessionID, "reportId": report.ID})

	fail := func(reason string) error {
		_ = o.DB.SaveReportFailure(ctx, report.ID, reason)
		o.broadcast(sessionID, "report_failed", map[string]string{"sessionId": sessionID, "reason": reason})
		return fmt.Errorf("orchestrator: %s", reason)
	}

	if !o.configured() {
		return fail("OpenRouter is not configured (OPENROUTER_API_KEY unset) — no model was called")
	}

	events, err := o.DB.GetSessionEvents(ctx, sessionID)
	if err != nil {
		_ = o.DB.SaveReportFailure(ctx, report.ID, err.Error())
		return err
	}
	var sess db.Session
	var tc db.TemplateContent
	if s, err := o.DB.GetSession(ctx, sessionID); err == nil {
		sess = s
		tc = o.templateContent(ctx, sess)
	}
	work, trail := digestEvents(events, tc.StarterFiles)
	work = clipMiddle(work, maxWorkChars)
	trail = clipMiddle(trail, maxAnalysisTrailChars)

	var evidence []db.EvidenceItem
	var forReport []string
	var integrity []string

	// collect files one agent's output as evidence. Anything the agent
	// flagged as the candidate trying to steer it is lifted out, so it is
	// reported once, under its own heading, rather than buried in prose.
	collect := func(category, heading, out string, err error) {
		if err != nil {
			slog.Warn("orchestrator: "+category+" skipped", "session", sessionID, "error", err)
			return
		}
		observations, findings := llm.SplitIntegrity(out)
		integrity = append(integrity, findings...)
		if observations == "" {
			return
		}
		evidence = append(evidence, db.EvidenceItem{Category: category, Observation: observations})
		forReport = append(forReport, heading+":\n"+observations)
	}

	out, err := o.Agents.EvaluateCode(ctx, briefOf(tc), work)
	collect("code_evaluation", "Code Evaluation", out, err)
	out, err = o.Agents.AnalyzeReasoning(ctx, trail)
	collect("reasoning", "Reasoning", out, err)
	out, err = o.Agents.AnalyzeWorkflow(ctx, trail)
	collect("workflow", "Workflow", out, err)
	out, err = o.Agents.AnalyzeInterview(ctx, work, formatTranscript(turnsOf(events, eventInterview)))
	collect("interview", "Interview", out, err)

	if len(forReport) == 0 {
		return fail("no agent produced usable evidence for this session (see server logs for each agent's error)")
	}

	// How the assistant was used, and whether its code is in the submission —
	// checked against the record rather than judged by a model.
	if uptake := assistantUptake(events); uptake != "" {
		evidence = append(evidence, db.EvidenceItem{Category: "ai_usage", Observation: uptake})
		forReport = append(forReport, "AI assistant usage:\n"+uptake)
	}

	// The agents are asked to flag steering themselves, but whether they do
	// depends on the model. This check reads the candidate's own words
	// directly and doesn't — see llm.DetectSteering.
	integrity = append(integrity, detectSteering(events)...)

	if len(integrity) > 0 {
		text := "The candidate's material contained text that tried to instruct or influence the AI evaluating it. The agents were told to disregard it; a reviewer should look at it directly.\n\n- " + strings.Join(dedupe(integrity), "\n- ")
		evidence = append(evidence, db.EvidenceItem{Category: "integrity", Observation: text})
		forReport = append(forReport, "Integrity:\n"+text)
	}

	// The rubric is scored from the agents' observations, not the raw
	// session: the same evidence a hiring team reads is what the scores
	// have to be justified by. A template with no rubric simply has no
	// scorecard — the report doesn't depend on one.
	var scores []llm.RubricScore
	if rubric := parseRubric(tc.Rubric); len(rubric) > 0 {
		if scores, err = o.Agents.ScoreRubric(ctx, rubric, forReport); err != nil {
			slog.Warn("orchestrator: rubric scoring skipped", "session", sessionID, "error", err)
			scores = nil
		} else {
			text := formatScorecard(scores)
			evidence = append(evidence, db.EvidenceItem{Category: "rubric", Observation: text})
			forReport = append(forReport, "Rubric scores:\n"+text)
		}
	}

	result, err := o.Agents.GenerateReport(ctx, forReport)
	if err != nil {
		return fail(err.Error())
	}

	if err := o.DB.SaveReportResult(ctx, report.ID, result.Recommendation, result.Summary, evidence); err != nil {
		return err
	}
	if len(scores) > 0 && sess.AssessmentID != nil {
		sections := make(map[string]int, len(scores))
		for _, s := range scores {
			sections[s.Label] = s.Score
		}
		if err := o.DB.SetApplicationScores(ctx, *sess.AssessmentID, llm.OverallScore(scores), sections); err != nil {
			slog.Error("orchestrator: writing scores to the company pipeline failed", "session", sessionID, "error", err)
		}
	}
	o.broadcast(sessionID, "report_ready", map[string]string{"sessionId": sessionID, "reportId": report.ID})
	return nil
}

// detectSteering runs llm.DetectSteering over everything the candidate
// wrote in a session — the files they submitted, what they typed to the
// assistant, and their interview answers — and says where each hit was.
func detectSteering(events []db.ActivityEvent) []string {
	var found []string
	note := func(where string, text string) {
		for _, quote := range llm.DetectSteering(text) {
			found = append(found, fmt.Sprintf("In %s: \"%s\"", where, quote))
		}
	}

	var latest *snapshotPayload
	for _, e := range events {
		switch e.EventType {
		case eventSnapshot:
			var snap snapshotPayload
			if json.Unmarshal(e.Payload, &snap) == nil {
				latest = &snap
			}
		case eventAIUsage, eventInterview:
			var t Turn
			if json.Unmarshal(e.Payload, &t) == nil && t.Role == roleCandidate {
				where := "a message to the assistant"
				if e.EventType == eventInterview {
					where = "an interview answer"
				}
				note(where, t.Text)
			}
		}
	}
	if latest != nil {
		paths := make([]string, 0, len(latest.Files))
		for p := range latest.Files {
			paths = append(paths, p)
		}
		sort.Strings(paths)
		for _, p := range paths {
			note("the submitted file "+strings.TrimPrefix(p, "/"), latest.Files[p])
		}
	}
	return found
}

// parseRubric reads game_templates.rubric, dropping criteria with no label
// or no id — there would be nothing to score or nothing to key the score by.
func parseRubric(raw json.RawMessage) []llm.RubricCriterion {
	var all []llm.RubricCriterion
	if len(raw) == 0 || json.Unmarshal(raw, &all) != nil {
		return nil
	}
	kept := all[:0]
	for _, c := range all {
		if strings.TrimSpace(c.Label) != "" && c.ID != "" {
			kept = append(kept, c)
		}
	}
	return kept
}

// formatScorecard is the rubric result as a person reads it in the report.
func formatScorecard(scores []llm.RubricScore) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Overall: %d/100 (weighted)\n", llm.OverallScore(scores))
	for _, s := range scores {
		fmt.Fprintf(&b, "\n%s (weight %g) — %d/100. %s", s.Label, s.Weight, s.Score, s.Reason)
	}
	return b.String()
}

func dedupe(in []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// digestEvents turns a session's raw activity_events into (a) what the
// candidate actually changed, for the Code Evaluation agent and the
// interviewer, and (b) a plain chronological text trail for the Reasoning
// and Workflow agents.
//
// The work comes from the latest workspace snapshot compared against the
// starter files (see describeWork); a session with no snapshot falls back to
// whatever diffs its "git" events carried.
//
// The trail leaves out what isn't an action by the candidate: snapshots (a
// codebase), the interview (its own evidence, analysed separately), and the
// platform's own bookkeeping (what a model call cost, where a recording was
// stored). A run of identical consecutive events — auto-save firing on the
// same file again and again — is written once with a count, and each
// payload is clipped so one large event can't crowd out the rest. Callers
// bound the whole thing with clipMiddle.
func digestEvents(events []db.ActivityEvent, starter map[string]string) (work string, trail string) {
	var diffLines []string
	var lines []string
	var latest *snapshotPayload

	// The run being collapsed: its event type and payload, when it started
	// and last recurred, and how many times.
	var runKey, runFirst, runLast string
	runCount := 0
	flush := func() {
		switch {
		case runCount == 1:
			lines = append(lines, fmt.Sprintf("[%s] %s", runFirst, runKey))
		case runCount > 1:
			lines = append(lines, fmt.Sprintf("[%s–%s] %s (×%d)", runFirst, runLast, runKey, runCount))
		}
		runCount = 0
	}

	for _, e := range events {
		switch e.EventType {
		case eventSnapshot:
			var snap snapshotPayload
			if json.Unmarshal(e.Payload, &snap) == nil {
				latest = &snap
			}
			continue
		case eventInterview, eventAICost, eventInterviewRecording, eventRecordingExpired:
			continue
		case "git":
			var p struct {
				Diff string `json:"diff"`
			}
			if json.Unmarshal(e.Payload, &p) == nil && p.Diff != "" {
				diffLines = append(diffLines, p.Diff)
			}
		}
		payload := string(e.Payload)
		if len(payload) > maxTrailPayload {
			payload = payload[:maxTrailPayload] + "…"
		}
		key := e.EventType + ": " + payload
		at := e.OccurredAt.Format("15:04:05")
		if runCount > 0 && key == runKey {
			runCount++
			runLast = at
			continue
		}
		flush()
		runKey, runFirst, runLast, runCount = key, at, at, 1
	}
	flush()

	work = describeWork(latest, starter)
	if work == "" {
		work = strings.Join(diffLines, "\n\n")
	}
	return work, strings.Join(lines, "\n")
}

// clipMiddle bounds text to about max characters by dropping whole lines
// from the middle, keeping the first third and the last two thirds of the
// budget, and saying how much went. Text already within the limit comes
// back unchanged.
func clipMiddle(text string, max int) string {
	if len(text) <= max {
		return text
	}
	lines := strings.Split(text, "\n")
	headBudget, tailBudget := max/3, max-max/3

	head := 0
	for used := 0; head < len(lines) && used+len(lines[head])+1 <= headBudget; head++ {
		used += len(lines[head]) + 1
	}
	tail := len(lines)
	for used := 0; tail > head && used+len(lines[tail-1])+1 <= tailBudget; tail-- {
		used += len(lines[tail-1]) + 1
	}
	if head == 0 || tail == len(lines) || tail <= head {
		// A line too long to fit at the start or the end — most simply, one
		// line longer than the whole budget. Dropping whole lines would
		// leave that side empty, so cut by characters instead.
		return text[:headBudget] + "\n[… cut for length …]\n" + text[len(text)-tailBudget:]
	}
	marker := fmt.Sprintf("[… %d lines omitted here to keep this within length; the session's start and end are shown in full …]", tail-head)
	return strings.Join(append(append(append([]string{}, lines[:head]...), marker), lines[tail:]...), "\n")
}

// recordUsage is the agents' OnUsage hook: every model call's cost is logged,
// and — when the call was made for a session — stored on that session's
// trail as an "ai_cost" event, which is what lets spend be added up per
// candidate, per assessment and per company.
//
// It deliberately doesn't use the caller's context for the write: the call
// it's accounting for has already been paid for, and a request that was
// cancelled a moment later shouldn't lose the record of it.
func (o *Orchestrator) recordUsage(_ context.Context, u llm.Usage) {
	slog.Info("llm usage", "agent", u.Agent, "model", u.Model, "session", u.SessionID,
		"prompt_tokens", u.PromptTokens, "completion_tokens", u.CompletionTokens, "cost_usd", math.Round(u.CostUSD*1e6)/1e6)
	if u.SessionID == "" || o.DB == nil {
		return
	}
	payload, err := json.Marshal(u)
	if err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// Straight to the database, not through RecordEvents: what a call cost
	// is not something to broadcast into the candidate's own session room.
	if err := o.DB.InsertActivityEvents(ctx, u.SessionID, []db.NewActivityEvent{{EventType: eventAICost, Payload: payload}}); err != nil {
		slog.Error("orchestrator: recording model usage failed", "session", u.SessionID, "error", err)
	}
}
