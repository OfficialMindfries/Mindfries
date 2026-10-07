// Package session verifies the signed cookies the two Next.js frontends
// issue — it deliberately does not mint a first sign-in for either portal;
// sign-in stays where the password hash and scrypt work already live
// (candidate/frontend/src/lib/auth, internal-admin/frontend/lib/auth). This
// package is the Go-side twin of both apps' lib/auth/session.ts: same
// HMAC-SHA256-over-base64url construction, so a cookie either app signs
// verifies here without either app knowing the Go backend exists.
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

// Cookie names — must match SESSION_COOKIE in each frontend's session.ts.
const (
	CandidateCookie = "mf_candidate"
	AdminCookie     = "mf_admin"
	CompanyCookie   = "mf_company"
)

// ErrInvalid covers every way a token can fail to verify: missing, malformed,
// wrong signature, or expired. Deliberately one error rather than several —
// none of those cases should be told apart by a caller (that's exactly the
// kind of detail an attacker probing the endpoint shouldn't get back).
var ErrInvalid = errors.New("session: invalid or expired token")

// CandidateClaims mirrors candidate/frontend/src/lib/auth/session.ts's
// exported Session interface field for field.
type CandidateClaims struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Exp   int64  `json:"exp"`
}

// AdminClaims mirrors internal-admin/frontend/lib/auth/session.ts's Session.
type AdminClaims struct {
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"` // "admin" | "viewer"
	Root  bool   `json:"root"`
	Exp   int64  `json:"exp"`
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

// SignCandidate is used by tests and by any future Go-side session issuance;
// today candidate/frontend is the only real minter, this just proves the two
// implementations agree bit for bit.
func SignCandidate(c CandidateClaims, secret string) (string, error) { return sign(c, secret) }

// SignAdmin is the admin equivalent of SignCandidate.
func SignAdmin(a AdminClaims, secret string) (string, error) { return sign(a, secret) }

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

// VerifyCandidate validates an "mf_candidate" cookie value against
// CANDIDATE_SESSION_SECRET (the same value candidate/frontend's
// SESSION_SECRET holds).
func VerifyCandidate(token, secret string) (*CandidateClaims, error) {
	raw, err := verify(token, secret)
	if err != nil {
		return nil, err
	}
	var c CandidateClaims
	if err := json.Unmarshal(raw, &c); err != nil || c.ID == "" || c.Email == "" {
		return nil, ErrInvalid
	}
	return &c, nil
}

// VerifyAdmin validates an "mf_admin" cookie value against
// ADMIN_SESSION_SECRET (the same value internal-admin/frontend's
// SESSION_SECRET holds).
func VerifyAdmin(token, secret string) (*AdminClaims, error) {
	raw, err := verify(token, secret)
	if err != nil {
		return nil, err
	}
	var a AdminClaims
	if err := json.Unmarshal(raw, &a); err != nil || a.Email == "" || (a.Role != "admin" && a.Role != "viewer") {
		return nil, ErrInvalid
	}
	return &a, nil
}

// LiveTicket lets a candidate's browser open one WebSocket straight to this
// backend for the live voice interview. The browser can't present the
// "mf_candidate" cookie there — that cookie belongs to candidate/frontend's
// origin — so the frontend's server, which can, asks for a ticket on the
// candidate's behalf and hands it to the page.
type LiveTicket struct {
	SessionID   string `json:"sid"`
	CandidateID string `json:"cid"`
	Exp         int64  `json:"exp"`
}

// liveTicketSecret keeps tickets and cookies from being interchangeable: a
// ticket is signed with a key derived from the session secret, so neither
// verifies as the other even though both are HMACs under the same setting.
func liveTicketSecret(secret string) string { return secret + "|live-interview-ticket" }

// SignLiveTicket issues a ticket valid until t.Exp (unix seconds).
func SignLiveTicket(t LiveTicket, secret string) (string, error) {
	if secret == "" {
		return "", ErrInvalid
	}
	return sign(t, liveTicketSecret(secret))
}

// VerifyLiveTicket checks a ticket's signature and expiry.
func VerifyLiveTicket(token, secret string) (*LiveTicket, error) {
	if secret == "" {
		return nil, ErrInvalid
	}
	raw, err := verify(token, liveTicketSecret(secret))
	if err != nil {
		return nil, err
	}
	var t LiveTicket
	if err := json.Unmarshal(raw, &t); err != nil || t.SessionID == "" || t.CandidateID == "" {
		return nil, ErrInvalid
	}
	return &t, nil
}

// CompanyClaims mirrors company/frontend/lib/auth/session.ts's Session.
type CompanyClaims struct {
	Email       string `json:"email"`
	Name        string `json:"name"`
	Role        string `json:"role"` // "admin" | "recruiter" | "viewer"
	CompanyID   string `json:"companyId"`
	CompanyName string `json:"companyName"`
	Exp         int64  `json:"exp"`
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
	if err := json.Unmarshal(raw, &c); err != nil || c.Email == "" || c.CompanyID == "" ||
		(c.Role != "admin" && c.Role != "recruiter" && c.Role != "viewer") {
		return nil, ErrInvalid
	}
	return &c, nil
}

// SignCompany is the company equivalent of SignCandidate — for tests.
func SignCompany(c CompanyClaims, secret string) (string, error) { return sign(c, secret) }

// An events ticket lets a candidate's browser subscribe to their own
// session's live events — the same LiveTicket shape, signed under a
// different key so that neither kind of ticket can be spent as the other.
func eventsTicketSecret(secret string) string { return secret + "|session-events-ticket" }

// SignEventsTicket issues a ticket for a session's event stream.
func SignEventsTicket(t LiveTicket, secret string) (string, error) {
	if secret == "" {
		return "", ErrInvalid
	}
	return sign(t, eventsTicketSecret(secret))
}

// VerifyEventsTicket checks an events ticket's signature and expiry.
func VerifyEventsTicket(token, secret string) (*LiveTicket, error) {
	if secret == "" {
		return nil, ErrInvalid
	}
	raw, err := verify(token, eventsTicketSecret(secret))
	if err != nil {
		return nil, err
	}
	var t LiveTicket
	if err := json.Unmarshal(raw, &t); err != nil || t.SessionID == "" || t.CandidateID == "" {
		return nil, ErrInvalid
	}
	return &t, nil
}
