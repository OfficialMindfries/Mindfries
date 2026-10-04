package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func httptestBody(json string) *strings.Reader {
	return strings.NewReader(json)
}

func TestCreateRoleRejectsMissingTitle(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/roles", httptestBody(`{"title":"","visibility":"invite_only"}`))
	rec := httptest.NewRecorder()
	s.handleCreateRole(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestCreateRoleRejectsInvalidVisibility(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/roles", httptestBody(`{"title":"Backend Engineer","visibility":"everyone"}`))
	rec := httptest.NewRecorder()
	s.handleCreateRole(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestCreateRoleRejectsMalformedBody(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/roles", httptestBody(`not json`))
	rec := httptest.NewRecorder()
	s.handleCreateRole(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
