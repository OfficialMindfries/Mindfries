package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mindfries/company-backend/internal/db"
)

// These exercise the request-validation branches that return before ever
// touching s.db — a live DATABASE_URL isn't available to this test binary
// (same constraint candidate/backend's own test suite already lives with:
// its tests cover config/session/middleware logic, not live queries: real
// DB behavior is verified by running the service, as Phase 1's manual smoke
// test already did).

func TestCompareCandidatesRejectsTooFewIds(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/candidates/compare?ids=a", nil)
	rec := httptest.NewRecorder()
	s.handleCompareCandidates(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestCompareCandidatesRejectsTooManyIds(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/candidates/compare?ids=a,b,c,d,e", nil)
	rec := httptest.NewRecorder()
	s.handleCompareCandidates(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestCompareCandidatesDedupesBeforeRangeCheck(t *testing.T) {
	// "a,a,a" has 3 raw entries but only 1 distinct id — should be rejected
	// as too few (1 < 2), proving dedup happens before the 2-4 range check,
	// not after.
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/candidates/compare?ids=a,a,a", nil)
	rec := httptest.NewRecorder()
	s.handleCompareCandidates(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (deduped to 1 id)", rec.Code)
	}
}

func TestSetCandidateStageRejectsInvalidStage(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/candidates/1/stage", httptestBody(`{"stage":"on_the_moon"}`))
	rec := httptest.NewRecorder()
	s.handleSetCandidateStage(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestValidStagesMatchesAllSixStages(t *testing.T) {
	want := []string{"invited", "in_progress", "completed", "shortlisted", "rejected", "hired"}
	if len(db.ValidStages) != len(want) {
		t.Fatalf("len(ValidStages) = %d, want %d", len(db.ValidStages), len(want))
	}
	for _, s := range want {
		if !db.ValidStages[s] {
			t.Fatalf("ValidStages missing %q", s)
		}
	}
}

func TestInviteCandidateRejectsInvalidEmail(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/roles/1/candidates", httptestBody(`{"candidateEmail":"not-an-email"}`))
	rec := httptest.NewRecorder()
	s.handleInviteCandidate(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestInviteCandidateRejectsMalformedBody(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/roles/1/candidates", httptestBody(`not json`))
	rec := httptest.NewRecorder()
	s.handleInviteCandidate(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestCandidateInviteOnlyAdminOrRecruiter(t *testing.T) {
	s := newTestServer(testSecret)
	h := s.requireAction(ActionCandidateInvite, func(w http.ResponseWriter, r *http.Request) { t.Error("handler must not run") })

	req := httptest.NewRequest(http.MethodPost, "/api/v1/roles/1/candidates", nil)
	req.AddCookie(&http.Cookie{Name: "mf_company", Value: signToken(t, "viewer", testSecret)})
	rec := httptest.NewRecorder()
	h(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("viewer must not reach candidate:invite — status = %d, want 403", rec.Code)
	}
}

func TestBulkSetCandidateStageRejectsInvalidStage(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/roles/1/candidates/bulk-stage", httptestBody(`{"applicationIds":["a","b"],"stage":"on_the_moon"}`))
	rec := httptest.NewRecorder()
	s.handleBulkSetCandidateStage(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestBulkSetCandidateStageNoOpOnEmptyIds(t *testing.T) {
	// Mirrors bulkSetApplicationStage's own early return on an empty list —
	// must not reach s.db (nil in this test server) at all.
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/roles/1/candidates/bulk-stage", httptestBody(`{"applicationIds":[],"stage":"hired"}`))
	rec := httptest.NewRecorder()
	s.handleBulkSetCandidateStage(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (no-op)", rec.Code)
	}
}
