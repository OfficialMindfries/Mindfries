package db

import (
	"context"
	"encoding/json"
)

// The Company Portal's pipeline (candidate_applications,
// supabase/migrations/0011_company_portal.sql) is where a hiring team
// watches a candidate move from invited to completed, and reads their score.
// The portal creates those rows; nothing used to update them afterwards, so
// a candidate who had finished and been evaluated still read "invited" with
// no score. These three functions are the write-back, called by the
// orchestrator as the session behind an application progresses.
//
// All three key on the invitation (assessment_id) and are no-ops when no
// application points at it — a session from the open pool or an admin invite
// has no pipeline row to update, and that isn't an error.

// MarkApplicationStarted moves an application from invited to in_progress.
// Only from invited: a stage a recruiter has since set by hand is theirs.
func (d *DB) MarkApplicationStarted(ctx context.Context, assessmentID string) error {
	_, err := d.pool.Exec(ctx, `
		update candidate_applications
		set stage = 'in_progress'
		where assessment_id = $1 and stage = 'invited'
	`, assessmentID)
	return err
}

// MarkApplicationCompleted records that the candidate submitted: when, how
// long they took, and — unless a recruiter has already moved them on to
// shortlisted, rejected or hired — the completed stage.
func (d *DB) MarkApplicationCompleted(ctx context.Context, assessmentID string, timeTakenMin int) error {
	_, err := d.pool.Exec(ctx, `
		update candidate_applications
		set stage = case when stage in ('invited', 'in_progress') then 'completed' else stage end,
		    completed_at = now(),
		    time_taken_min = $2
		where assessment_id = $1
	`, assessmentID, timeTakenMin)
	return err
}

// SetApplicationScores stores the rubric result on the application: the
// weighted overall score and one score per rubric criterion, keyed by the
// criterion's label — the shape the portal's pipeline and compare views
// already read.
func (d *DB) SetApplicationScores(ctx context.Context, assessmentID string, score int, sections map[string]int) error {
	raw, err := json.Marshal(sections)
	if err != nil {
		return err
	}
	_, err = d.pool.Exec(ctx, `
		update candidate_applications
		set score = $2, section_scores = $3
		where assessment_id = $1
	`, assessmentID, score, raw)
	return err
}
