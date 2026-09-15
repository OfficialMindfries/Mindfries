// Mints the one-time "set your password" link a newly created company_users
// row gets (IMPLEMENTATION.md §6) — this app creates the token when ops
// onboards a company (see lib/db.ts's createCompanyUserInvite); an
// identical copy in company/frontend verifies it. Kept duplicated, not
// shared, same reasoning as every other auth file split across these apps:
// no design/auth package exists between them yet (IMPLEMENTATION.md §2.1).
//
// Deliberately its own secret (COMPANY_INVITE_SECRET), not this app's own
// SESSION_SECRET: reusing an admin session secret here would let a forged
// invite double as a forged admin session in the other direction.

export interface InviteClaims {
  companyUserId: string;
  email: string;
  /** Seconds since the epoch. */
  exp: number;
}

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Absent or too short means invites can't be minted — the safe direction. */
export function inviteSecret(): string | null {
  const s = process.env.COMPANY_INVITE_SECRET;
  return s && s.length >= 32 ? s : null;
}

const SEVEN_DAYS = 60 * 60 * 24 * 7;

export async function signInviteToken(claims: Omit<InviteClaims, "exp">, secret: string, maxAge = SEVEN_DAYS): Promise<string> {
  const payload: InviteClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + maxAge };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}
