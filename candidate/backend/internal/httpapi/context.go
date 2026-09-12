package httpapi

import (
	"context"
	"net/http"

	"github.com/mindfries/candidate-backend/internal/session"
)

type ctxKey int

const (
	ctxCandidate ctxKey = iota
	ctxAdmin
)

func withCandidate(r *http.Request, c *session.CandidateClaims) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), ctxCandidate, c))
}

func candidateFrom(r *http.Request) *session.CandidateClaims {
	c, _ := r.Context().Value(ctxCandidate).(*session.CandidateClaims)
	return c
}

func withAdmin(r *http.Request, a *session.AdminClaims) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), ctxAdmin, a))
}

func adminFrom(r *http.Request) *session.AdminClaims {
	a, _ := r.Context().Value(ctxAdmin).(*session.AdminClaims)
	return a
}
