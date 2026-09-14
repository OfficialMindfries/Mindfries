package db

import (
	"context"
	"encoding/json"
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
// IDE needs, and only that — not name/tech-stack/duration, which the
// session already carries or doesn't need repeated. Kept separate from
// Template (and its own query, not joined into ListPublishedTemplates)
// deliberately: starter_files can be real file content, and a list of every
// published template shouldn't drag that along for assessments nobody
// started.
type TemplateContent struct {
	TaskBrief    *string
	StarterFiles map[string]string
}

// GetTemplateContent loads a template's brief and starter files by id — no
// `status = 'published'` filter, unlike GetPublishedTemplate: a session
// already exists against this template (it started while published, or via
// an invitation, which never required 'published' status), so the content
// behind it should still resolve even if the template's status changed
// since.
func (d *DB) GetTemplateContent(ctx context.Context, templateID string) (TemplateContent, error) {
	var tc TemplateContent
	var starterFilesRaw []byte
	err := d.pool.QueryRow(ctx, `
		select task_brief, starter_files
		from game_templates
		where id = $1
	`, templateID).Scan(&tc.TaskBrief, &starterFilesRaw)
	if err != nil {
		return TemplateContent{}, err
	}
	if len(starterFilesRaw) > 0 {
		if err := json.Unmarshal(starterFilesRaw, &tc.StarterFiles); err != nil {
			return TemplateContent{}, err
		}
	}
	return tc, nil
}
