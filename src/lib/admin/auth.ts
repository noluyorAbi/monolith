import "server-only";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * The admin gate.
 *
 * One secret, `ADMIN_PASSWORD`, held only in the environment. It is never
 * written to the repository, never sent to the browser, and never stored in
 * the launch data. The session cookie is signed with a key derived from it, so
 * changing the password logs every session out, which is the behaviour you
 * want from a rotation.
 *
 * Without `ADMIN_PASSWORD` set, the panel does not exist: every entry point
 * answers 404. That matters because this repository is public and a fork
 * deployed by a stranger must not ship an unlocked door.
 */

const COOKIE_NAME = "monolith_admin";
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;

/** Fixed, public, and not a secret: scrypt needs a salt, the password is the secret. */
const KEY_SALT = "monolith-admin-session-v1";

export { COOKIE_NAME, SESSION_MAX_AGE_S };

function configuredPassword(): string | null {
  const raw = process.env.ADMIN_PASSWORD;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** False means the panel is switched off, not that the password was wrong. */
export function adminEnabled(): boolean {
  return configuredPassword() !== null;
}

/**
 * scrypt is deliberately slow, so the derived key is cached against the
 * password that produced it. The cache is per instance and is discarded when
 * the password changes, which is exactly when the old sessions should die.
 */
let derived: { password: string; key: Buffer } | null = null;

function sessionKey(password: string): Buffer {
  if (derived?.password === password) return derived.key;
  const key = scryptSync(password, KEY_SALT, 32);
  derived = { password, key };
  return key;
}

function sign(body: string, password: string): string {
  return createHmac("sha256", sessionKey(password)).update(body).digest("base64url");
}

/**
 * Constant-time comparison of the attempt against the configured password.
 * Both sides are hashed first so the comparison always runs over 32 bytes and
 * the length of the real password does not leak through the timing of a
 * length check.
 */
export function passwordMatches(attempt: string): boolean {
  const password = configuredPassword();
  if (password === null) return false;
  const a = createHash("sha256").update(attempt, "utf8").digest();
  const b = createHash("sha256").update(password, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** `expiry.nonce.signature`. The nonce only makes two tokens issued in the same millisecond differ. */
export function issueSession(): string | null {
  const password = configuredPassword();
  if (password === null) return null;
  const body = `${Date.now() + SESSION_MAX_AGE_S * 1000}.${randomBytes(12).toString("base64url")}`;
  return `${body}.${sign(body, password)}`;
}

export function sessionValid(token: string | undefined | null): boolean {
  const password = configuredPassword();
  if (password === null || !token) return false;
  const cut = token.lastIndexOf(".");
  if (cut <= 0) return false;

  const presented = Buffer.from(token.slice(cut + 1), "utf8");
  const expected = Buffer.from(sign(token.slice(0, cut), password), "utf8");
  // timingSafeEqual throws on a length mismatch, so the lengths are compared
  // first. A forged token of the wrong length is rejected here; one of the
  // right length still gets a constant-time comparison.
  if (presented.length !== expected.length) return false;
  if (!timingSafeEqual(presented, expected)) return false;

  const expiry = Number(token.slice(0, cut).split(".")[0]);
  return Number.isFinite(expiry) && expiry > Date.now();
}

/**
 * Login throttling.
 *
 * Held in module scope, so it is per running instance rather than global. On
 * Fluid Compute an instance is reused across requests, which makes this
 * effective against the case it is written for: someone walking a password
 * list against the live panel. It is not a distributed rate limiter and does
 * not pretend to be one. The real protection is the password itself.
 */
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const ATTEMPT_LIMIT = 8;
const attempts = new Map<string, { count: number; since: number }>();

export function throttled(key: string): boolean {
  const now = Date.now();
  const seen = attempts.get(key);
  if (!seen || now - seen.since > ATTEMPT_WINDOW_MS) return false;
  return seen.count >= ATTEMPT_LIMIT;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const seen = attempts.get(key);
  if (!seen || now - seen.since > ATTEMPT_WINDOW_MS) {
    attempts.set(key, { count: 1, since: now });
    return;
  }
  seen.count += 1;
  // Unbounded growth would be a memory leak with an attacker holding the pen.
  if (attempts.size > 5000) attempts.clear();
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}

/** Best available client identity behind Vercel's proxy. Spoofable, which is why it only throttles. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
