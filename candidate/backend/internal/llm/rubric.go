package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
)

// RubricCriterion is one line of a template's evaluation rubric, as authored
// in the admin library (game_templates.rubric: [{id, label, weight}]).
type RubricCriterion struct {
	ID     string  `json:"id"`
	Label  string  `json:"label"`
	Weight float64 `json:"weight"`
}

// RubricScore is one criterion scored against the session's evidence.
type RubricScore struct {
	ID     string  `json:"id"`
	Label  string  `json:"label"`
	Weight float64 `json:"weight"`
	// Score is 0–100.
	Score int `json:"score"`
	// Reason is the one or two sentences of evidence the score rests on. A
	// number with no reason attached is exactly the "judge, don't explain"
	// output this product exists to avoid.
	Reason string `json:"reason"`
}

const rubricSystemPrompt = `You are the Rubric agent in Mindfries' evidence-based hiring platform.
You are given an evaluation rubric written by the hiring team, and the evidence other agents collected about one candidate's assessment session.
Score the candidate on each criterion from 0 to 100, using only that evidence:
- 90-100 exceptional, 70-89 strong, 50-69 adequate, 30-49 weak, 0-29 little or no evidence of the skill.
- Every score needs a reason of one or two sentences that points at specific evidence. If the evidence says nothing about a criterion, score it 0-29 and say the session produced no evidence for it — do not guess.
- Score each criterion on its own; do not let one strong area lift the others.
Reply with strict JSON only, no prose outside it, no markdown code fence:
{"scores": [{"id": "<criterion id, exactly as given>", "score": <integer 0-100>, "reason": "<one or two sentences>"}]}` + injectionRule

// ScoreRubric scores each criterion of a rubric against a session's
// evidence. The model supplies only a score and a reason per criterion id;
// labels and weights are taken from the rubric itself, so nothing the model
// returns can alter what was being measured or how much it counts.
//
// A criterion the model skipped, or scored outside 0–100, is an error: a
// partial scorecard would produce an overall score that silently ignores
// part of the rubric.
func (a *Agents) ScoreRubric(ctx context.Context, rubric []RubricCriterion, evidence []string) ([]RubricScore, error) {
	if len(rubric) == 0 {
		return nil, errors.New("llm: this assessment has no rubric to score against")
	}
	if len(evidence) == 0 {
		return nil, errors.New("llm: no evidence available to score a rubric against")
	}
	ctx = withAgent(ctx, "rubric")

	var b strings.Builder
	b.WriteString("RUBRIC\n")
	for _, c := range rubric {
		fmt.Fprintf(&b, "- id %q: %s (weight %g)\n", c.ID, c.Label, c.Weight)
	}
	b.WriteString("\nEVIDENCE\n" + untrusted("evidence", strings.Join(evidence, "\n\n---\n\n")))

	raw, err := a.client.CompleteQuick(ctx, a.models.Report, []ChatMessage{
		{Role: "system", Content: rubricSystemPrompt},
		{Role: "user", Content: b.String()},
	}, rubricTokens)
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Scores []struct {
			ID     string  `json:"id"`
			Score  float64 `json:"score"`
			Reason string  `json:"reason"`
		} `json:"scores"`
	}
	if err := json.Unmarshal([]byte(stripCodeFence(raw)), &parsed); err != nil {
		return nil, fmt.Errorf("llm: the rubric scores weren't the requested JSON: %w", err)
	}
	byID := map[string]int{}
	for i, s := range parsed.Scores {
		byID[s.ID] = i
	}

	out := make([]RubricScore, 0, len(rubric))
	for _, c := range rubric {
		i, ok := byID[c.ID]
		if !ok {
			return nil, fmt.Errorf("llm: the model returned no score for rubric criterion %q", c.Label)
		}
		s := parsed.Scores[i]
		if s.Score < 0 || s.Score > 100 || math.IsNaN(s.Score) {
			return nil, fmt.Errorf("llm: the model scored %q outside 0-100", c.Label)
		}
		out = append(out, RubricScore{ID: c.ID, Label: c.Label, Weight: c.Weight, Score: int(math.Round(s.Score)), Reason: strings.TrimSpace(s.Reason)})
	}
	return out, nil
}

// OverallScore is the weighted average of a scorecard, 0–100. Weights don't
// have to sum to 100 — the admin form only suggests it — so they're
// normalized here. A rubric whose weights are all zero is averaged evenly
// rather than divided by zero.
func OverallScore(scores []RubricScore) int {
	if len(scores) == 0 {
		return 0
	}
	var total, weight float64
	for _, s := range scores {
		w := math.Max(0, s.Weight)
		total += float64(s.Score) * w
		weight += w
	}
	if weight == 0 {
		for _, s := range scores {
			total += float64(s.Score)
		}
		return int(math.Round(total / float64(len(scores))))
	}
	return int(math.Round(total / weight))
}
