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
