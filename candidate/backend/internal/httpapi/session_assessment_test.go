package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/mindfries/candidate-backend/internal/config"
	"github.com/mindfries/candidate-backend/internal/db"
	"github.com/mindfries/candidate-backend/internal/session"
)

// ── fake DB ────────────────────────────────────────────────────────────────
// Only the methods handleGetSessionAssessment actually calls are implemented;
// everything else panics so a test that accidentally touches the wrong path
// fails loudly rather than silently passing with zero data.

type fakeDB struct {
	sessions map[string]db.Session
	content  map[string]db.TemplateContent // keyed by template id
	standing map[string]db.AccountStanding // keyed by candidate id; absent means active, nothing withdrawn
}

func (f *fakeDB) GetSession(_ context.Context, id string) (db.Session, error) {
	s, ok := f.sessions[id]
	if !ok {
		return db.Session{}, db.ErrNotFound
	}
	return s, nil
}

func (f *fakeDB) GetTemplateContent(_ context.Context, templateID string) (db.TemplateContent, error) {
	c, ok := f.content[templateID]
	if !ok {
		return db.TemplateContent{}, db.ErrNotFound
	}
	return c, nil
}

func (f *fakeDB) Ping(ctx context.Context) error { return nil }
func (f *fakeDB) ListPublishedTemplates(ctx context.Context) ([]db.Template, error) { panic("unimplemented") }
func (f *fakeDB) ListInvitationsForCandidate(ctx context.Context, candidateID, email string) ([]db.Invitation, error) { panic("unimplemented") }
func (f *fakeDB) StartSession(ctx context.Context, candidateID, candidateName string, tmpl db.Template) (db.Session, error) { panic("unimplemented") }
func (f *fakeDB) StartSessionFromInvitation(ctx context.Context, candidateID, candidateName string, inv db.Invitation) (db.Session, error) { panic("unimplemented") }
func (f *fakeDB) GetSessionByCandidateAndTemplate(ctx context.Context, candidateID, templateID string) (db.Session, error) { panic("unimplemented") }
func (f *fakeDB) MarkSubmitted(ctx context.Context, id string) error { panic("unimplemented") }
func (f *fakeDB) GetReportBySession(ctx context.Context, sessionID string) (db.Report, error) { panic("unimplemented") }
func (f *fakeDB) GetEvidenceItems(ctx context.Context, reportID string) ([]db.EvidenceItem, error) { panic("unimplemented") }
func (f *fakeDB) ListAdminSessions(ctx context.Context) ([]db.AdminSessionRow, error) { panic("unimplemented") }
func (f *fakeDB) UpdateSessionState(ctx context.Context, id string, patch db.SessionStatePatch) error { panic("unimplemented") }
func (f *fakeDB) GetAccountStanding(ctx context.Context, candidateID string) (db.AccountStanding, error) {
	if standing, ok := f.standing[candidateID]; ok {
		return standing, nil
	}
	return db.AccountStanding{Found: true, Active: true}, nil
}
func (f *fakeDB) SetSandboxID(ctx context.Context, id string, sandboxID *string) error { panic("unimplemented") }
func (f *fakeDB) ListSessionRefsForCandidate(ctx context.Context, candidateID string) ([]db.SessionRef, error) { panic("unimplemented") }
func (f *fakeDB) GetInterviewConfig(ctx context.Context, assessmentID *string) db.InterviewConfig { panic("unimplemented") }

// ── helpers ─────────────────────────────────────────────────────────────────

func candidateToken(t *testing.T, id, email, name string) string {
	t.Helper()
	tok, err := session.SignCandidate(
		session.CandidateClaims{ID: id, Email: email, Name: name, Exp: time.Now().Add(time.Hour).Unix()},
		testSecret,
	)
	if err != nil {
		t.Fatalf("SignCandidate: %v", err)
	}
	return tok
}

func makeServer(database sessionStore) *Server {
	return &Server{
		cfg: config.Config{CandidateSessionSecret: testSecret, AllowedOrigins: []string{"http://localhost:3000"}},
		db:  database,
	}
}

// ── Tests ────────────────────────────────────────────────────────────────────

// TestSessionAssessmentReturnsNameAndDuration is the regression guard for the
// P0 bug: before this fix the endpoint omitted assessmentName and durationMin,
// causing IdeShell to show a hardcoded title and a reset-to-90:00 countdown
// on every page refresh.
func TestSessionAssessmentReturnsNameAndDuration(t *testing.T) {
	tmplID := "tmpl-abc"
	cid := "cand-1"
	brief := "Fix the auth bug in handler.go."

	store := &fakeDB{
		sessions: map[string]db.Session{
			"sess-1": {
				ID:          "sess-1",
				CandidateID: &cid,
				TemplateID:  &tmplID,
				Status:      "live",
			},
		},
		content: map[string]db.TemplateContent{
			tmplID: {
				Name:        "Frontend Engineering — Auth Bug Fix",
				TaskBrief:   &brief,
			},
		},
	}

	srv := makeServer(store)
	token := candidateToken(t, cid, "alice@example.com", "Alice")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sessions/sess-1/assessment", nil)
	req.SetPathValue("id", "sess-1")
	// Inject the cookie claim via context because we bypass the middleware directly calling the handler
	claims := &session.CandidateClaims{ID: cid, Email: "alice@example.com", Name: "Alice"}
	req = withCandidate(req, claims)
	req.AddCookie(&http.Cookie{Name: session.CandidateCookie, Value: token})
	rec := httptest.NewRecorder()

	srv.handleGetSessionAssessment(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", rec.Code, rec.Body.String())
	}

	var got map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if got["name"] != "Frontend Engineering — Auth Bug Fix" {
		t.Errorf("name = %v, want the real template name", got["name"])
	}
	if got["taskBrief"] != brief {
		t.Errorf("taskBrief = %v, want %q", got["taskBrief"], brief)
	}
}

// TestSessionAssessmentNoTemplateReturnsEmptyNotError verifies the early-exit
// path: a session without an attached template returns 200 with an empty
// body (name: ""), not a 4xx or 5xx. The IDE degrades to its honest "no real brief yet" state either way.
func TestSessionAssessmentNoTemplateReturnsEmptyNotError(t *testing.T) {
	cid := "cand-2"
	store := &fakeDB{
		sessions: map[string]db.Session{
			"sess-notempl": {
				ID:          "sess-notempl",
				CandidateID: &cid,
				TemplateID:  nil, // no template attached
				Status:      "live",
			},
		},
		content: map[string]db.TemplateContent{},
	}

	srv := makeServer(store)
	token := candidateToken(t, cid, "bob@example.com", "Bob")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sessions/sess-notempl/assessment", nil)
	req.SetPathValue("id", "sess-notempl")
	claims := &session.CandidateClaims{ID: cid, Email: "bob@example.com", Name: "Bob"}
	req = withCandidate(req, claims)
	req.AddCookie(&http.Cookie{Name: session.CandidateCookie, Value: token})
	rec := httptest.NewRecorder()

	srv.handleGetSessionAssessment(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 even with no template; body = %s", rec.Code, rec.Body.String())
	}

	var got map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// taskBrief and starterFiles are omitempty — absent is correct.
	// name always appears (zero value).
	if _, ok := got["taskBrief"]; ok {
		t.Error("taskBrief should be absent when no template is attached")
	}
}

// TestSessionAssessmentEnforcesOwnership verifies that candidate B cannot
// read candidate A's session content — the ownership check must fire before
// the template fetch.
func TestSessionAssessmentEnforcesOwnership(t *testing.T) {
	ownerID := "cand-owner"
	tmplID := "tmpl-xyz"

	store := &fakeDB{
		sessions: map[string]db.Session{
			"sess-owned": {
				ID:          "sess-owned",
				CandidateID: &ownerID,
				TemplateID:  &tmplID,
				Status:      "live",
			},
		},
		content: map[string]db.TemplateContent{},
	}

	srv := makeServer(store)
	// Token for a DIFFERENT candidate
	wrongToken := candidateToken(t, "cand-intruder", "bad@example.com", "Intruder")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sessions/sess-owned/assessment", nil)
	req.SetPathValue("id", "sess-owned")
	claims := &session.CandidateClaims{ID: "cand-intruder", Email: "bad@example.com", Name: "Intruder"}
	req = withCandidate(req, claims)
	req.AddCookie(&http.Cookie{Name: session.CandidateCookie, Value: wrongToken})
	rec := httptest.NewRecorder()

	srv.handleGetSessionAssessment(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 for a session owned by a different candidate", rec.Code)
	}
}

// TestSessionAssessmentReturnsStarterFiles verifies starter_files pass through
// intact — these are the real codebase files seeded into the IDE VFS.
func TestSessionAssessmentReturnsStarterFiles(t *testing.T) {
	tmplID := "tmpl-files"
	cid := "cand-3"

	store := &fakeDB{
		sessions: map[string]db.Session{
			"sess-files": {
				ID:          "sess-files",
				CandidateID: &cid,
				TemplateID:  &tmplID,
				Status:      "live",
			},
		},
		content: map[string]db.TemplateContent{
			tmplID: {
				Name:        "Refactor Challenge",
				StarterFiles: map[string]string{
					"src/main.go":    "package main\n",
					"src/handler.go": "package main\nfunc handler() {}\n",
				},
			},
		},
	}

	srv := makeServer(store)
	token := candidateToken(t, cid, "carol@example.com", "Carol")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/sessions/sess-files/assessment", nil)
	req.SetPathValue("id", "sess-files")
	claims := &session.CandidateClaims{ID: cid, Email: "carol@example.com", Name: "Carol"}
	req = withCandidate(req, claims)
	req.AddCookie(&http.Cookie{Name: session.CandidateCookie, Value: token})
	rec := httptest.NewRecorder()

	srv.handleGetSessionAssessment(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; body = %s", rec.Code, rec.Body.String())
	}

	var got map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}

	files, ok := got["starterFiles"].(map[string]interface{})
	if !ok {
		t.Fatalf("starterFiles missing or wrong type: %v", got["starterFiles"])
	}
	if len(files) != 2 {
		t.Errorf("starterFiles has %d entries, want 2", len(files))
	}
	if files["src/main.go"] != "package main\n" {
		t.Errorf("src/main.go = %v", files["src/main.go"])
	}
	if got["name"] != "Refactor Challenge" {
		t.Errorf("name = %v", got["name"])
	}
}
