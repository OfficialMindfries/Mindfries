import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Password hashing, as plain Node. Identical to internal-admin/frontend's
// copy (lib/auth/scrypt.ts) — kept duplicated rather than shared because
// there is no package between the three apps yet (IMPLEMENTATION.md §2.1).
//
// This module is Node-only and must never be imported from middleware, which
// runs on the Edge runtime. Middleware verifies the session cookie instead
// (lib/auth/session.ts), and that uses Web Crypto so it runs in both.

const scrypt = promisify(scryptCb) as (p: string | Buffer, s: Buffer, k: number, o: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

// ~64 MB per hash. Comfortable for a handful of logins; painful in bulk.
const N = 2 ** 16;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 160 * 1024 * 1024;

const b64 = (b: Buffer) => b.toString("base64");

/** "scrypt$N$r$p$salt$hash" — self-describing, so the cost can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${b64(salt)}$${b64(hash)}`;
}

/**
 * Constant-time check. Returns false for a malformed record rather than
 * throwing, so one bad row can't turn into a 500 on the login page. An empty
 * password_hash (an invited account that hasn't set one yet) is malformed by
 * this format too, so it fails closed the same way.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const cost = { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM };
  if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashB64, "base64");
    const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, cost);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * Compare two secrets without leaking their relationship through timing.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  const max = Math.max(ab.length, bb.length, 1);
  const pa = Buffer.alloc(max);
  const pb = Buffer.alloc(max);
  ab.copy(pa);
  bb.copy(pb);
  return timingSafeEqual(pa, pb) && ab.length === bb.length;
}

/**
 * A deliberate delay on a failed login for an address that doesn't exist, so
 * "no such account" and "wrong password" take comparably long.
 */
export async function dummyWork(): Promise<void> {
  await scrypt("no-such-user", randomBytes(16), KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
}
