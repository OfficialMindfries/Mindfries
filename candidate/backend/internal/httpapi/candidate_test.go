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
