package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestInviteTeamRejectsMissingFields(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/team/invite", httptestBody(`{"email":"","name":"","role":"admin"}`))
	rec := httptest.NewRecorder()
	s.handleInviteTeam(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestInviteTeamRejectsInvalidRole(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/team/invite", httptestBody(`{"email":"a@b.com","name":"A","role":"superadmin"}`))
	rec := httptest.NewRecorder()
	s.handleInviteTeam(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestSetTeamStatusRejectsInvalidStatus(t *testing.T) {
	s := newTestServer(testSecret)
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/team/1", httptestBody(`{"status":"on_vacation"}`))
	rec := httptest.NewRecorder()
	s.handleSetTeamStatus(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestTeamManageOnlyAdmin(t *testing.T) {
	s := newTestServer(testSecret)
	h := s.requireAction(ActionTeamManage, func(w http.ResponseWriter, r *http.Request) { t.Error("handler must not run") })

	req := httptest.NewRequest(http.MethodPost, "/api/v1/team/invite", nil)
	req.AddCookie(&http.Cookie{Name: "mf_company", Value: signToken(t, "recruiter", testSecret)})
	rec := httptest.NewRecorder()
	h(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("recruiter must not reach team:manage — status = %d, want 403", rec.Code)
	}
}
