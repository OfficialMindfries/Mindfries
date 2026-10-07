package db

import (
	"context"
	"encoding/json"
)

// InterviewConfig is how the follow-up interview runs for one session. A
// company sets it per role in the Company Portal (job_roles.interview_config,
// supabase/migrations/0014_interview_config.sql); a session that didn't come
// from a company role — the open pool, an admin invite — runs on the defaults.
type InterviewConfig struct {
	// Questions is how many questions the interviewer asks.
	Questions int `json:"questions"`
	// Tone is one of InterviewTones.
	Tone string `json:"tone"`
	// Language is a BCP-47 tag from InterviewLanguages — the language the
	// interviewer asks in, and the one the browser's speech features use.
	Language string `json:"language"`
	// AnswerSeconds is how long the candidate has to answer each question.
	AnswerSeconds int `json:"answerSeconds"`
}

// Bounds and choices for InterviewConfig. company/frontend's interview
// settings form (lib/interview.ts) offers the same ones — change both.
const (
	MinInterviewQuestions = 2
	MaxInterviewQuestions = 8
	MinAnswerSeconds      = 30
	MaxAnswerSeconds      = 600
)

// InterviewTones are the registers a company can pick for the interviewer.
var InterviewTones = map[string]bool{"neutral": true, "friendly": true, "rigorous": true}

// InterviewLanguages maps the tags a company can pick to the name the model
// is told to ask in.
var InterviewLanguages = map[string]string{
	"en-US": "English",
	"hi-IN": "Hindi",
	"es-ES": "Spanish",
	"fr-FR": "French",
	"de-DE": "German",
	"pt-BR": "Portuguese",
	"ja-JP": "Japanese",
	"ar-SA": "Arabic",
	"zh-CN": "Mandarin Chinese",
}

// DefaultInterviewConfig is the interview every session got before any of
// this was configurable.
func DefaultInterviewConfig() InterviewConfig {
	return InterviewConfig{Questions: 4, Tone: "neutral", Language: "en-US", AnswerSeconds: 120}
}

// Normalized returns c with every unset or out-of-range field replaced by
// its default. The stored JSON is company input, so nothing downstream
// trusts it as-is: an interview can't be configured into zero questions, a
// hundred of them, or a language the model was never told how to name.
func (c InterviewConfig) Normalized() InterviewConfig {
	d := DefaultInterviewConfig()
	if c.Questions < MinInterviewQuestions || c.Questions > MaxInterviewQuestions {
		c.Questions = d.Questions
	}
	if !InterviewTones[c.Tone] {
		c.Tone = d.Tone
	}
	if _, ok := InterviewLanguages[c.Language]; !ok {
		c.Language = d.Language
	}
	if c.AnswerSeconds < MinAnswerSeconds || c.AnswerSeconds > MaxAnswerSeconds {
		c.AnswerSeconds = d.AnswerSeconds
	}
	return c
}

// GetInterviewConfig returns the interview settings of the role an
// invitation belongs to. Everything that isn't a clean hit resolves to the
// defaults rather than an error: no invitation, an invitation that isn't
// attached to a company role, a database where migration 0014 hasn't run
// yet. The interview should never fail to start over a setting.
func (d *DB) GetInterviewConfig(ctx context.Context, assessmentID *string) InterviewConfig {
	cfg := DefaultInterviewConfig()
	if assessmentID == nil {
		return cfg
	}
	var raw []byte
	err := d.pool.QueryRow(ctx, `
		select r.interview_config
		from candidate_applications ca
		join job_roles r on r.id = ca.job_role_id
		where ca.assessment_id = $1
		limit 1
	`, *assessmentID).Scan(&raw)
	if err != nil || len(raw) == 0 {
		return cfg
	}
	var stored InterviewConfig
	if json.Unmarshal(raw, &stored) != nil {
		return cfg
	}
	return stored.Normalized()
}
