package session

import (
	"testing"
	"time"
)

const testSecret = "test-secret-at-least-32-characters-long!!"

func validClaims() CompanyClaims {
	return CompanyClaims{
		Email:       "a@b.com",
		Name:        "A",
		Role:        RoleAdmin,
		CompanyID:   "company-1",
		CompanyName: "Acme",
		Exp:         time.Now().Add(time.Hour).Unix(),
	}
}

func TestVerifyCompanyAcceptsValidToken(t *testing.T) {
	token, err := SignCompany(validClaims(), testSecret)
	if err != nil {
		t.Fatalf("SignCompany: %v", err)
	}
	claims, err := VerifyCompany(token, testSecret)
	if err != nil {
		t.Fatalf("VerifyCompany: %v", err)
	}
	if claims.Email != "a@b.com" || claims.CompanyID != "company-1" || claims.Role != RoleAdmin {
		t.Fatalf("claims = %+v, unexpected", claims)
	}
}

func TestVerifyCompanyRejectsWrongSecret(t *testing.T) {
	token, err := SignCompany(validClaims(), testSecret)
	if err != nil {
		t.Fatalf("SignCompany: %v", err)
	}
	if _, err := VerifyCompany(token, "a-completely-different-secret-32-chars!"); err != ErrInvalid {
		t.Fatalf("err = %v, want ErrInvalid", err)
	}
}

func TestVerifyCompanyRejectsTamperedBody(t *testing.T) {
	token, err := SignCompany(validClaims(), testSecret)
	if err != nil {
		t.Fatalf("SignCompany: %v", err)
	}
	tampered := token[:len(token)-4] + "abcd"
	if _, err := VerifyCompany(tampered, testSecret); err != ErrInvalid {
		t.Fatalf("err = %v, want ErrInvalid", err)
	}
}

func TestVerifyCompanyRejectsExpiredToken(t *testing.T) {
	claims := validClaims()
	claims.Exp = time.Now().Add(-time.Hour).Unix()
	token, err := SignCompany(claims, testSecret)
	if err != nil {
		t.Fatalf("SignCompany: %v", err)
	}
	if _, err := VerifyCompany(token, testSecret); err != ErrInvalid {
		t.Fatalf("err = %v, want ErrInvalid", err)
	}
}

func TestVerifyCompanyRejectsInvalidRole(t *testing.T) {
	claims := validClaims()
	claims.Role = "superadmin"
	token, err := SignCompany(claims, testSecret)
	if err != nil {
		t.Fatalf("SignCompany: %v", err)
	}
	if _, err := VerifyCompany(token, testSecret); err != ErrInvalid {
		t.Fatalf("err = %v, want ErrInvalid", err)
	}
}

func TestVerifyCompanyRejectsMissingCompanyID(t *testing.T) {
	claims := validClaims()
	claims.CompanyID = ""
	token, err := SignCompany(claims, testSecret)
	if err != nil {
		t.Fatalf("SignCompany: %v", err)
	}
	if _, err := VerifyCompany(token, testSecret); err != ErrInvalid {
		t.Fatalf("err = %v, want ErrInvalid", err)
	}
}

func TestVerifyCompanyRejectsEmptyTokenOrSecret(t *testing.T) {
	if _, err := VerifyCompany("", testSecret); err != ErrInvalid {
		t.Fatalf("empty token: err = %v, want ErrInvalid", err)
	}
	token, _ := SignCompany(validClaims(), testSecret)
	if _, err := VerifyCompany(token, ""); err != ErrInvalid {
		t.Fatalf("empty secret: err = %v, want ErrInvalid", err)
	}
}
