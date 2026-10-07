package db

import (
	"context"
	"encoding/json"
)

// AssistantConfig is what a company has decided about the workspace AI
// assistant for one role (job_roles.assistant_config,
// supabase/migrations/0015_assistant_config.sql). A session that didn't come
// from a company role runs on the defaults.
type AssistantConfig struct {
	// Enabled is whether candidates get the assistant at all.
	Enabled bool `json:"enabled"`
	// MaxMessages is how many messages a candidate may send it in a session.
	MaxMessages int `json:"maxMessages"`
}

// Bounds for AssistantConfig.MaxMessages. The upper one is the platform's
// own ceiling on model spend per session; a company can lower it, not raise
// it. company/frontend's lib/assistant.ts offers the same range — change both.
const (
	MinAssistantMessages = 1
	MaxAssistantMessages = 60
)

// DefaultAssistantConfig is the assistant every session had before this was
// configurable: on, up to the platform's ceiling.
func DefaultAssistantConfig() AssistantConfig {
	return AssistantConfig{Enabled: true, MaxMessages: MaxAssistantMessages}
}

// ParseAssistantConfig reads the stored JSON. Anything missing or out of
// range becomes its default — in particular an empty object, which is what
// every role has until someone changes it, means "on". Only an explicit
// `"enabled": false` turns the assistant off.
func ParseAssistantConfig(raw []byte) AssistantConfig {
	cfg := DefaultAssistantConfig()
	var stored struct {
		Enabled     *bool `json:"enabled"`
		MaxMessages int   `json:"maxMessages"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &stored) != nil {
		return cfg
	}
	if stored.Enabled != nil {
		cfg.Enabled = *stored.Enabled
	}
	if stored.MaxMessages >= MinAssistantMessages && stored.MaxMessages <= MaxAssistantMessages {
		cfg.MaxMessages = stored.MaxMessages
	}
	return cfg
}

// GetAssistantConfig returns the assistant settings of the role an
// invitation belongs to. Like GetInterviewConfig, everything that isn't a
// clean hit resolves to the defaults: no invitation, no company role, a
// database where migration 0015 hasn't run.
func (d *DB) GetAssistantConfig(ctx context.Context, assessmentID *string) AssistantConfig {
	if assessmentID == nil {
		return DefaultAssistantConfig()
	}
	var raw []byte
	err := d.pool.QueryRow(ctx, `
		select r.assistant_config
		from candidate_applications ca
		join job_roles r on r.id = ca.job_role_id
		where ca.assessment_id = $1
		limit 1
	`, *assessmentID).Scan(&raw)
	if err != nil {
		return DefaultAssistantConfig()
	}
	return ParseAssistantConfig(raw)
}
