package db

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

// Template is a published assessment ("game") a candidate can start —
// game_templates rows with status = 'published' (supabase/migrations/0002_product.sql).
type Template struct {
	ID          string
	Name        string
	TaskVariant string
	TechStack   []string
	DurationMin int
}

// ListPublishedTemplates mirrors candidate/frontend's listAvailableAssessments
// (src/lib/db.ts), moved server-side into the Go Application API.
func (d *DB) ListPublishedTemplates(ctx context.Context) ([]Template, error) {
	rows, err := d.pool.Query(ctx, `
		select id, name, task_variant, tech_stack, duration_min
		from game_templates
		where status = 'published'
		order by created_at desc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Template
	for rows.Next() {
		var t Template
		if err := rows.Scan(&t.ID, &t.Name, &t.TaskVariant, &t.TechStack, &t.DurationMin); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// GetPublishedTemplate is used before starting a session, so a candidate
// can't start against a draft or nonexistent template id.
func (d *DB) GetPublishedTemplate(ctx context.Context, id string) (*Template, error) {
	var t Template
	err := d.pool.QueryRow(ctx, `
		select id, name, task_variant, tech_stack, duration_min
		from game_templates
		where id = $1 and status = 'published'
	`, id).Scan(&t.ID, &t.Name, &t.TaskVariant, &t.TechStack, &t.DurationMin)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// TemplateContent is the part of a template an already-running session's
// IDE needs, and only that — not tech-stack/status, which the session already
// carries or doesn't need repeated. Kept separate from Template (and its own
// query, not joined into ListPublishedTemplates) deliberately: starter_files
// can be real file content, and a list of every published template shouldn't
// drag that along for assessments nobody started.
type TemplateContent struct {
	Name      string
	TaskBrief *string
	// InterviewerPrompt is the author's guidance for the AI interviewer
	// ("probe how they located the failing path…"). Often unset.
	InterviewerPrompt *string
	StarterFiles      map[string]string
	// Rubric is the template's evaluation rubric as stored: a JSON array of
	// {id, label, weight}. Empty or "[]" when the author set none.
	Rubric json.RawMessage
	// Variants are alternative versions of the task (0017_task_generation.sql).
	// Empty for most templates.
	Variants []TemplateVariant
}

// TemplateVariant is one alternative version of a template's task: its own
// brief and starting files, sharing everything else with the original.
type TemplateVariant struct {
	TaskBrief    string            `json:"taskBrief"`
	StarterFiles map[string]string `json:"starterFiles"`
}

// Version returns the content as version n of the task: the original for 0
// (or any n that isn't a variant), otherwise the nth variant's brief and
// files in place of the original's. The name, rubric and interviewer
// guidance are the template's either way.
func (tc TemplateContent) Version(n int) TemplateContent {
	if n < 1 || n > len(tc.Variants) {
		return tc
	}
	v := tc.Variants[n-1]
	out := tc
	brief := v.TaskBrief
	out.TaskBrief = &brief
	out.StarterFiles = v.StarterFiles
	return out
}

// GetTemplateContent loads a template's name, duration, brief and starter
// files by id — no `status = 'published'` filter, unlike GetPublishedTemplate:
// a session already exists against this template (it started while published,
// or via an invitation, which never required 'published' status), so the
// content behind it should still resolve even if the template's status changed
// since.
func (d *DB) GetTemplateContent(ctx context.Context, templateID string) (TemplateContent, error) {
	var tc TemplateContent
	var starterFilesRaw, variantsRaw []byte
	err := d.pool.QueryRow(ctx, `
		select name, task_brief, interviewer_prompt, starter_files, rubric, variants
		from game_templates
		where id = $1
	`, templateID).Scan(&tc.Name, &tc.TaskBrief, &tc.InterviewerPrompt, &starterFilesRaw, &tc.Rubric, &variantsRaw)
	if isUndefinedColumn(err) {
		// A database migration 0017 hasn't reached yet: no template there
		// can have variants, so the answer without them is the whole answer.
		err = d.pool.QueryRow(ctx, `
			select name, task_brief, interviewer_prompt, starter_files, rubric
			from game_templates
			where id = $1
		`, templateID).Scan(&tc.Name, &tc.TaskBrief, &tc.InterviewerPrompt, &starterFilesRaw, &tc.Rubric)
	}
	if err != nil {
		return TemplateContent{}, err
	}
	if len(starterFilesRaw) > 0 {
		if err := json.Unmarshal(starterFilesRaw, &tc.StarterFiles); err != nil {
			return TemplateContent{}, err
		}
	}
	if len(variantsRaw) > 0 {
		// A malformed variants column costs the variants, not the task.
		var variants []TemplateVariant
		if json.Unmarshal(variantsRaw, &variants) == nil {
			for _, v := range variants {
				if v.TaskBrief != "" && len(v.StarterFiles) > 0 {
					tc.Variants = append(tc.Variants, v)
				}
			}
		}
	}
	return tc, nil
}

// isUndefinedColumn reports Postgres's "column does not exist" (42703).
func isUndefinedColumn(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "42703"
}
