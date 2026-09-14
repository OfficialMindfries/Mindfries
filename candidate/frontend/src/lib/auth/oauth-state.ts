// A short-lived signed value for the OAuth `state` round-trip — same HMAC
// mechanism as lib/auth/session.ts (Web Crypto, not node:crypto, so this can
// run from a route handler without pulling in the Node-only scrypt module),
// deliberately kept as its own small module rather than folded into
// session.ts: a session cookie and an OAuth state cookie should never be
// interchangeable, even in principle, and two independent readers enforce
// that structurally instead of by convention.
//
// What this defends against: an attacker starting the OAuth dance on their
// own account and tricking a victim's browser into completing it (login
// CSRF), which would otherwise link the attacker's GitHub/Google identity to
// the victim's session, or vice versa. The provider's own `state` param is
// exactly the mechanism OAuth2 defines for this — see RFC 6749 §10.12.

export interface OAuthState {
  /** Must match the [provider] route segment on both start and callback. */
  provider: string;
  /** Where to send the browser after a successful sign-in. Always a local path — see the callback route. */
  next: string;
  /** Random per-attempt value, so a captured/replayed state can't be reused. */
  nonce: string;
  exp: number;
}

export const OAUTH_STATE_COOKIE = "mf_oauth_state";
const MAX_AGE_SECONDS = 10 * 60; // the OAuth round-trip should take seconds, not minutes

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

export function randomNonce(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(24)));
}

export async function signOAuthState(claims: Omit<OAuthState, "exp">, secret: string): Promise<string> {
  const payload: OAuthState = { ...claims, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** The claims if the signature holds, it hasn't expired, and the nonce matches the one echoed back in `?state=`. */
export async function readOAuthState(token: string | undefined, expectedNonce: string, secret: string | null): Promise<OAuthState | null> {
  if (!token || !secret || !expectedNonce) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), unb64url(token.slice(dot + 1)), enc.encode(body));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(unb64url(body))) as OAuthState;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    if (!claims.nonce || claims.nonce !== expectedNonce) return null;
    return claims;
  } catch {
    return null;
  }
}
