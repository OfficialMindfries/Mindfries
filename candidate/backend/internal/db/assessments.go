package db

import "context"

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
