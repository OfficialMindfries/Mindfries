package db

import "context"

// Template mirrors company/frontend/lib/types.ts's GameTemplate and
// lib/db.ts's toTemplate row mapping — the same shape
// candidate/backend/internal/db/assessments.go's own Template already uses
// for the identical query against the shared game_templates table.
type Template struct {
	ID          string
	Name        string
	TaskVariant string
	TechStack   []string
	DurationMin int
}

// ListPublishedTemplates mirrors listPublishedTemplates — every company
// picks from the same published Game Library, authored in internal-admin;
// no company-scoping to get right here, unlike everything else in this
// package.
func (d *DB) ListPublishedTemplates(ctx context.Context) ([]Template, error) {
	rows, err := d.pool.Query(ctx, `
		select id, name, task_variant, tech_stack, duration_min
		from game_templates
		where status = 'published'
		order by name asc
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
