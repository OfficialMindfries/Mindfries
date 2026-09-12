package session

import (
	"strings"
	"testing"
	"time"
)

const testSecret = "test-secret-at-least-32-characters-long!!"

func TestCandidateRoundTrip(t *testing.T) {
	want := CandidateClaims{ID: "c1", Email: "ada@example.com", Name: "Ada", Exp: time.Now().Add(time.Hour).Unix()}
	token, err := SignCandidate(want, testSecret)
	if err != nil {
		t.Fatalf("SignCandidate: %v", err)
	}
	got, err := VerifyCandidate(token, testSecret)
	if err != nil {
		t.Fatalf("VerifyCandidate: %v", err)
	}
	if *got != want {
		t.Fatalf("got %+v, want %+v", *got, want)
	}
}

func TestAdminRoundTrip(t *testing.T) {
	want := AdminClaims{Email: "ops@mindfries.com", Name: "Ops", Role: "admin", Root: true, Exp: time.Now().Add(time.Hour).Unix()}
	token, err := SignAdmin(want, testSecret)
	if err != nil {
		t.Fatalf("SignAdmin: %v", err)
	}
	got, err := VerifyAdmin(token, testSecret)
	if err != nil {
		t.Fatalf("VerifyAdmin: %v", err)
	}
	if *got != want {
		t.Fatalf("got %+v, want %+v", *got, want)
	}
}

func TestVerifyRejectsWrongSecret(t *testing.T) {
	token, _ := SignCandidate(CandidateClaims{ID: "c1", Email: "a@b.com", Name: "A", Exp: time.Now().Add(time.Hour).Unix()}, testSecret)
	if _, err := VerifyCandidate(token, "a-completely-different-secret-value!!"); err != ErrInvalid {
		t.Fatalf("expected ErrInvalid, got %v", err)
	}
}

func TestVerifyRejectsTamperedBody(t *testing.T) {
	token, _ := SignCandidate(CandidateClaims{ID: "c1", Email: "a@b.com", Name: "A", Exp: time.Now().Add(time.Hour).Unix()}, testSecret)
	dot := strings.LastIndexByte(token, '.')
	body, sig := token[:dot], token[dot:]
	// Flip the first character of the body — the signature no longer matches.
	tampered := string(body[0]+1) + body[1:] + sig
	if _, err := VerifyCandidate(tampered, testSecret); err != ErrInvalid {
		t.Fatalf("expected ErrInvalid for tampered body, got %v", err)
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	token, _ := SignCandidate(CandidateClaims{ID: "c1", Email: "a@b.com", Name: "A", Exp: time.Now().Add(-time.Minute).Unix()}, testSecret)
	if _, err := VerifyCandidate(token, testSecret); err != ErrInvalid {
		t.Fatalf("expected ErrInvalid for expired token, got %v", err)
	}
}

func TestVerifyRejectsMalformedOrEmpty(t *testing.T) {
	cases := []string{"", "no-dot-here", ".", "abc.", ".abc"}
	for _, c := range cases {
		if _, err := VerifyCandidate(c, testSecret); err != ErrInvalid {
			t.Fatalf("token %q: expected ErrInvalid, got %v", c, err)
		}
	}
	// Empty secret must never verify anything, even a well-formed token.
	token, _ := SignCandidate(CandidateClaims{ID: "c1", Email: "a@b.com", Name: "A", Exp: time.Now().Add(time.Hour).Unix()}, testSecret)
	if _, err := VerifyCandidate(token, ""); err != ErrInvalid {
		t.Fatalf("expected ErrInvalid for empty secret, got %v", err)
	}
}

func TestVerifyRejectsWrongClaimShape(t *testing.T) {
	// An admin token should not verify as a candidate — VerifyCandidate
	// requires a non-empty email, which admin claims also carry, so this
	// specifically exercises that a mismatched-but-plausible shape doesn't
	// silently pass through with zero-valued fields.
	admin := AdminClaims{Email: "", Name: "No Email", Role: "admin", Exp: time.Now().Add(time.Hour).Unix()}
	token, _ := SignAdmin(admin, testSecret)
	if _, err := VerifyCandidate(token, testSecret); err != ErrInvalid {
		t.Fatalf("expected ErrInvalid for empty-email claims, got %v", err)
	}
}

// TestCrossShapeConfusion guards the exact bug caught while wiring up
// httpapi's middleware: a token signed for one cookie has non-overlapping
// required fields with the other's claims shape, so if it ever ends up
// under the wrong cookie name (candidate/admin frontends misconfigured, a
// proxy rewriting cookie names, etc.) it must not silently authenticate as
// the other kind of session with a zero-valued required field.
func TestCrossShapeConfusion(t *testing.T) {
	adminToken, _ := SignAdmin(AdminClaims{Email: "ops@mindfries.com", Name: "Ops", Role: "admin", Exp: time.Now().Add(time.Hour).Unix()}, testSecret)
	if _, err := VerifyCandidate(adminToken, testSecret); err != ErrInvalid {
		t.Fatalf("an admin token must not verify as a candidate session (would carry a zero-value ID), got %v", err)
	}

	candidateToken, _ := SignCandidate(CandidateClaims{ID: "c1", Email: "ada@example.com", Name: "Ada", Exp: time.Now().Add(time.Hour).Unix()}, testSecret)
	if _, err := VerifyAdmin(candidateToken, testSecret); err != ErrInvalid {
		t.Fatalf("a candidate token must not verify as an admin session (would carry a zero-value Role), got %v", err)
	}
}
