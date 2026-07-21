export const STUDIO_COOKIE = "monolith_studio";
export const STUDIO_TTL_MS = 12 * 60 * 60 * 1000;

/** Length-safe, branch-free comparison so a wrong value leaks no timing signal. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface StudioEnv {
  /** MONOLITH_ADMIN_KEY, when it is configured. */
  key?: string;
  production: boolean;
}

export function studioEnv(): StudioEnv {
  return {
    key: process.env.MONOLITH_ADMIN_KEY || undefined,
    production: process.env.NODE_ENV === "production",
  };
}

/**
 * Fails closed. An unset key locks the studio in production rather than
 * publishing the order queue to anyone who guesses the path; local development
 * stays open so the bench is usable without ceremony.
 */
export function studioOpenWithoutKey(env: StudioEnv): boolean {
  return !env.key && !env.production;
}

/** Only used for the one-time `?key=` exchange, never for the stored session. */
export function verifyStudioKey(presented: string | undefined, env: StudioEnv): boolean {
  if (!env.key || !presented) return false;
  return constantTimeEqual(presented, env.key);
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", material, encoder.encode(message));
  return base64url(new Uint8Array(signature));
}

/**
 * `expiry.signature`. The session proves the admin key was presented once
 * without ever carrying it, so a stolen cookie cannot be replayed as the key
 * itself, expires on a clock the browser does not control, and dies the moment
 * MONOLITH_ADMIN_KEY is rotated.
 */
export async function mintStudioSession(env: StudioEnv, now: number): Promise<string | null> {
  if (!env.key) return null;
  const expiry = String(now + STUDIO_TTL_MS);
  return `${expiry}.${await sign(env.key, expiry)}`;
}

export async function verifyStudioSession(
  cookie: string | undefined,
  env: StudioEnv,
  now: number,
): Promise<boolean> {
  if (studioOpenWithoutKey(env)) return true;
  if (!env.key || !cookie) return false;

  const split = cookie.indexOf(".");
  if (split < 1) return false;
  const expiry = cookie.slice(0, split);
  const signature = cookie.slice(split + 1);
  if (!/^\d{1,15}$/.test(expiry) || Number(expiry) <= now) return false;

  return constantTimeEqual(signature, await sign(env.key, expiry));
}
