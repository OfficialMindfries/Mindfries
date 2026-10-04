// Package session verifies the signed "mf_company" cookie company/frontend
// issues — it deliberately does not mint a first sign-in itself; sign-in
// stays where the password hash work already lives
// (company/frontend/lib/auth). This package is the Go-side twin of that
// app's lib/auth/session.ts: same HMAC-SHA256-over-base64url construction,
// so a cookie company/frontend signs verifies here without that app knowing
// this backend exists. Mirrors candidate/backend's own internal/session
// package byte for byte in shape.
//
// The cookie is signed, not encrypted — the signature only proves the claims
// weren't tampered with after signing. Never rely on it to hide anything a
// holder of their own cookie shouldn't be able to read.
package session

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Cookie name — must match SESSION_COOKIE in company/frontend/lib/auth/session.ts.
const CompanyCookie = "mf_company"

// ErrInvalid covers every way a token can fail to verify: missing, malformed,
// wrong signature, or expired. Deliberately one error rather than several —
// none of those cases should be told apart by a caller (that's exactly the
// kind of detail an attacker probing the endpoint shouldn't get back).
var ErrInvalid = errors.New("session: invalid or expired token")

// CompanyRole mirrors company/frontend/lib/types.ts's CompanyRole.
type CompanyRole string

const (
	RoleAdmin     CompanyRole = "admin"
	RoleRecruiter CompanyRole = "recruiter"
	RoleViewer    CompanyRole = "viewer"
)

func (r CompanyRole) valid() bool {
	return r == RoleAdmin || r == RoleRecruiter || r == RoleViewer
}

// CompanyClaims mirrors company/frontend/lib/auth/session.ts's exported
// Session interface field for field.
type CompanyClaims struct {
	Email       string      `json:"email"`
	Name        string      `json:"name"`
	Role        CompanyRole `json:"role"`
	CompanyID   string      `json:"companyId"`
	CompanyName string      `json:"companyName"`
	Exp         int64       `json:"exp"`
}

func b64urlEncode(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func b64urlDecode(s string) ([]byte, error) { return base64.RawURLEncoding.DecodeString(s) }

// sign produces "<b64url(json)>.<b64url(hmac-sha256)>", matching the TS
// signSession's construction exactly: the signature covers the bytes of the
// base64url *string*, not the raw JSON bytes underneath it.
func sign(payload any, secret string) (string, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	body := b64urlEncode(raw)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	return body + "." + b64urlEncode(mac.Sum(nil)), nil
}

// SignCompany is used by tests to prove this implementation agrees bit for
// bit with company/frontend's own signSession.
func SignCompany(c CompanyClaims, secret string) (string, error) { return sign(c, secret) }

// verify checks the signature and expiry, returning the raw claims JSON for
// the caller to decode into whichever shape it expects. Constant-time
// comparison (hmac.Equal) throughout — this is the one function every
// authenticated request in the service runs through.
func verify(token, secret string) (json.RawMessage, error) {
	if token == "" || secret == "" {
		return nil, ErrInvalid
	}
	dot := strings.LastIndexByte(token, '.')
	if dot < 1 {
		return nil, ErrInvalid
	}
	body, sigPart := token[:dot], token[dot+1:]

	sig, err := b64urlDecode(sigPart)
	if err != nil {
		return nil, ErrInvalid
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(body))
	if !hmac.Equal(mac.Sum(nil), sig) {
		return nil, ErrInvalid
	}

	raw, err := b64urlDecode(body)
	if err != nil {
		return nil, ErrInvalid
	}

	var exp struct {
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(raw, &exp); err != nil {
		return nil, ErrInvalid
	}
	if exp.Exp <= 0 || time.Unix(exp.Exp, 0).Before(time.Now()) {
		return nil, ErrInvalid
	}

	return json.RawMessage(raw), nil
}

// VerifyCompany validates an "mf_company" cookie value against
// COMPANY_SESSION_SECRET (the same value company/frontend's SESSION_SECRET
// holds).
func VerifyCompany(token, secret string) (*CompanyClaims, error) {
	raw, err := verify(token, secret)
	if err != nil {
		return nil, err
	}
	var c CompanyClaims
	if err := json.Unmarshal(raw, &c); err != nil {
		return nil, ErrInvalid
	}
	if c.Email == "" || c.CompanyID == "" || !c.Role.valid() {
		return nil, ErrInvalid
	}
	return &c, nil
}
