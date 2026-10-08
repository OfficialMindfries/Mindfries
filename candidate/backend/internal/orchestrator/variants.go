package orchestrator

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/mindfries/candidate-backend/internal/db"
)

// A template can carry variants: alternative versions of the same task, so
// two candidates for one role needn't be handed the identical problem (and
// the second can't be handed the first's answer). Which one a session gets
// is decided once, when it starts, and written into its own trail — the
// brief and files the candidate sees must not change under them if the
// template's variants are edited later.

// eventVariantAssigned records which version of the task a session was
// given: {"index": n}, where 0 is the template's original and 1..N its
// variants in order.
const eventVariantAssigned = "variant_assigned"

type variantPayload struct {
	Index int `json:"index"`
	// Of is how many versions there were to choose from, for the record.
	Of int `json:"of"`
}

// assignVariant picks a version of the task for a session that has just
// started. Candidates are dealt versions in turn — the first gets the
// original, the next the first variant, and so on round — so consecutive
// candidates for a role always differ while there are versions left to
// differ by. A template with no variants needs no record at all.
func (o *Orchestrator) assignVariant(ctx context.Context, sess db.Session) {
	if sess.TemplateID == nil {
		return
	}
	tc, err := o.DB.GetTemplateContent(ctx, *sess.TemplateID)
	if err != nil || len(tc.Variants) == 0 {
		return
	}
	versions := len(tc.Variants) + 1
	earlier, err := o.DB.CountEarlierSessions(ctx, *sess.TemplateID, sess.ID)
	if err != nil {
		slog.Error("orchestrator: counting sessions to assign a task variant failed", "session", sess.ID, "error", err)
		return // the session runs on the original
	}
	payload, _ := json.Marshal(variantPayload{Index: earlier % versions, Of: versions})
	if err := o.DB.InsertActivityEvents(ctx, sess.ID, []db.NewActivityEvent{{EventType: eventVariantAssigned, Payload: payload}}); err != nil {
		slog.Error("orchestrator: recording the task variant failed", "session", sess.ID, "error", err)
	}
}

// sessionVariant is the version a session was assigned: 0 for the original,
// which is also the answer when nothing was recorded.
func (o *Orchestrator) sessionVariant(ctx context.Context, sessionID string) int {
	raw, err := o.DB.LatestEventPayload(ctx, sessionID, eventVariantAssigned)
	if err != nil || raw == nil {
		return 0
	}
	var p variantPayload
	if json.Unmarshal(raw, &p) != nil {
		return 0
	}
	return p.Index
}

// TemplateContent is the task behind a session as that session's candidate
// sees it: the template's brief and starter files, or those of the variant
// the session was assigned. Empty when the session has no template or the
// lookup fails — callers work with less rather than not at all.
func (o *Orchestrator) TemplateContent(ctx context.Context, sess db.Session) db.TemplateContent {
	if sess.TemplateID == nil {
		return db.TemplateContent{}
	}
	tc, err := o.DB.GetTemplateContent(ctx, *sess.TemplateID)
	if err != nil {
		return db.TemplateContent{}
	}
	if len(tc.Variants) == 0 {
		return tc
	}
	return tc.Version(o.sessionVariant(ctx, sess.ID))
}
