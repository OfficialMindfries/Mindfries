// The one-time "set your password" link a newly created company_users row
// gets, per IMPLEMENTATION.md §6: an invited account (ops-created first
// admin, or a teammate invited from /settings/team) never receives a
// plaintext password — it receives this signed link instead.
//
// Deliberately its own secret (COMPANY_INVITE_SECRET), not SESSION_SECRET:
// this token is also verified by internal-admin/frontend (which mints it
// when onboarding a company) via an identical copy of this file, so the two
// apps need one value they both hold — reusing either app's own session
// secret for that would let a forged invite double as a forged session.
//
// Same Web Crypto HMAC approach as lib/auth/session.ts, so it works from
// both the Node and Edge runtimes.

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

const unb64url = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const view = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return view;
};

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Absent or too short means every invite link fails to verify — the safe direction. */
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

export async function readInviteToken(token: string | undefined | null, secret: string | null): Promise<InviteClaims | null> {
  if (!token || !secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), unb64url(token.slice(dot + 1)), enc.encode(body));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(unb64url(body))) as InviteClaims;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    if (typeof claims.companyUserId !== "string" || !claims.companyUserId) return null;
    return claims;
  } catch {
    return null;
  }
}
