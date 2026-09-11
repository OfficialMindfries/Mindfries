// The signed session cookie.
//
// Deliberately NOT "server-only" and deliberately free of node:crypto: this
// runs in middleware too, which is the Edge runtime. Web Crypto's HMAC exists
// in both, so one implementation covers both and there is only one place where
// a session is judged valid.
//
// The cookie carries the claims and a signature over them. It is signed, not
// encrypted — so never put anything in here that the holder shouldn't read.
// Tampering is what the signature prevents.

export interface Session {
  /** Lower-cased email. */
  email: string;
  name: string;
  role: "admin" | "viewer";
  /** True for the environment-configured account that always has access. */
  root: boolean;
  /** Seconds since the epoch. */
  exp: number;
}

export const SESSION_COOKIE = "mf_admin";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Backed by a plain ArrayBuffer, which is what Web Crypto's BufferSource wants
// — Uint8Array.from can be typed over SharedArrayBuffer and won't assign.
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

/**
 * The signing secret. Absent, every session is invalid and nobody can sign in
 * — which is the safe direction to fail. It is never defaulted to a constant,
 * because a known secret means anyone can mint an admin cookie.
 */
export function sessionSecret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

export async function signSession(claims: Omit<Session, "exp">, secret: string, maxAge = SESSION_MAX_AGE): Promise<string> {
  const payload: Session = { ...claims, exp: Math.floor(Date.now() / 1000) + maxAge };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** The claims if the signature holds and the session hasn't expired, else null. */
export async function readSession(token: string | undefined, secret: string | null): Promise<Session | null> {
  if (!token || !secret) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), unb64url(token.slice(dot + 1)), enc.encode(body));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(unb64url(body))) as Session;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    if (typeof claims.email !== "string" || !claims.email) return null;
    return claims;
  } catch {
    return null;
  }
}
