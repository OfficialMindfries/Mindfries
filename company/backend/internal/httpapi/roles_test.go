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

func TestPatchRoleRejectsEmptyBody(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/roles/1", httptestBody(`{}`))
	rec := httptest.NewRecorder()
	s.handlePatchRole(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (neither templateId nor status given)", rec.Code)
	}
}

func TestPatchRoleRejectsInvalidStatus(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/roles/1", httptestBody(`{"status":"archived"}`))
	rec := httptest.NewRecorder()
	s.handlePatchRole(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestPatchRoleRejectsMalformedBody(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/roles/1", httptestBody(`not json`))
	rec := httptest.NewRecorder()
	s.handlePatchRole(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
