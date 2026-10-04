package httpapi

import (
	"context"
	"net/http"

	"github.com/mindfries/company-backend/internal/session"
)

type ctxKey int

const ctxCompany ctxKey = iota

func withCompany(r *http.Request, c *session.CompanyClaims) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), ctxCompany, c))
}

func companyFrom(r *http.Request) *session.CompanyClaims {
	c, _ := r.Context().Value(ctxCompany).(*session.CompanyClaims)
	return c
}
