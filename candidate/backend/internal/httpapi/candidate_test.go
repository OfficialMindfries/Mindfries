package httpapi

import (
	"reflect"
	"testing"

	"github.com/mindfries/candidate-backend/internal/db"
)

func TestToAssessmentViewCapsTagsAtTwoTechStackEntriesPlusDuration(t *testing.T) {
	got := toAssessmentView(db.Template{
		ID: "t1", Name: "Full-stack Engineer",
		TechStack: []string{"React", "Go", "Postgres", "Redis"}, DurationMin: 90,
	})
	want := []string{"React", "Go", "90 min"}
	if !reflect.DeepEqual(got.Tags, want) {
		t.Fatalf("Tags = %v, want %v", got.Tags, want)
	}
	if got.Role != "Full-stack Engineer" || got.Company != "Mindfries" || got.Status != "invited" {
		t.Fatalf("unexpected view: %+v", got)
	}
}

func TestToAssessmentViewHandlesFewerThanTwoTechStackEntries(t *testing.T) {
	got := toAssessmentView(db.Template{ID: "t2", Name: "Backend Engineer", TechStack: []string{"Rust"}, DurationMin: 60})
	want := []string{"Rust", "60 min"}
	if !reflect.DeepEqual(got.Tags, want) {
		t.Fatalf("Tags = %v, want %v", got.Tags, want)
	}
}

func TestToAssessmentViewHandlesNoTechStack(t *testing.T) {
	got := toAssessmentView(db.Template{ID: "t3", Name: "Generalist", DurationMin: 45})
	want := []string{"45 min"}
	if !reflect.DeepEqual(got.Tags, want) {
		t.Fatalf("Tags = %v, want %v", got.Tags, want)
	}
}

func TestInvitationStatusMapsUnderscoreToHyphen(t *testing.T) {
	cases := map[string]string{
		"invited":     "invited",
		"in_progress": "in-progress",
		"submitted":   "submitted",
		"closed":      "closed",
	}
	for in, want := range cases {
		if got := invitationStatus(in); got != want {
			t.Errorf("invitationStatus(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestToInvitationViewPrefersExplicitRoleOverTemplateName(t *testing.T) {
	role := "Senior Backend Engineer"
	got := toInvitationView(db.Invitation{
		ID: "a1", CompanyName: "Northwind Labs", TemplateName: "Bug Fix Sprint",
		TechStack: []string{"Go"}, DurationMin: 90, Role: &role, Status: "invited",
	})
	if got.Role != role {
		t.Fatalf("Role = %q, want the explicit role %q", got.Role, role)
	}
	if got.Company != "Northwind Labs" {
		t.Fatalf("Company = %q", got.Company)
	}
	if got.Status != "invited" {
		t.Fatalf("Status = %q", got.Status)
	}
	if got.Due != "No due date set" {
		t.Fatalf("Due = %q, want the honest no-due-date fallback", got.Due)
	}
}

func TestToInvitationViewFallsBackToTemplateName(t *testing.T) {
	got := toInvitationView(db.Invitation{ID: "a2", TemplateName: "Refactor Challenge", Status: "in_progress", DurationMin: 60})
	if got.Role != "Refactor Challenge" {
		t.Fatalf("Role = %q, want the template name when no explicit role is set", got.Role)
	}
	if got.Status != "in-progress" {
		t.Fatalf("Status = %q, want the hyphenated form", got.Status)
	}
}

func TestToInvitationViewCarriesMatchScoreThrough(t *testing.T) {
	score := 92
	got := toInvitationView(db.Invitation{ID: "a3", TemplateName: "X", Status: "invited", MatchScore: &score})
	if got.Match == nil || *got.Match != 92 {
		t.Fatalf("Match = %v, want 92", got.Match)
	}
}

func TestToInvitationViewFormatsDueDate(t *testing.T) {
	due := "2026-09-30"
	got := toInvitationView(db.Invitation{ID: "a4", TemplateName: "X", Status: "invited", DueDate: &due})
	if got.Due != "Due 2026-09-30" {
		t.Fatalf("Due = %q", got.Due)
	}
}

func TestSessionIsLiveOnlyForTheLiveStatus(t *testing.T) {
	cases := map[string]bool{
		"live":       true,
		"submitted":  false,
		"evaluating": false,
		"completed":  false,
		"failed":     false,
		"stuck":      false, // an admin support-override target, not something a candidate action should write around
		"":           false,
	}
	for status, want := range cases {
		if got := sessionIsLive(status); got != want {
			t.Errorf("sessionIsLive(%q) = %v, want %v", status, got, want)
		}
	}
}
